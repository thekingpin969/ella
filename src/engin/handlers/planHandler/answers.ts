// planHandler/answers.ts
// User answer handling and processing - simplified for document-centric approach

import { Context } from "../../types/context";
import { Event } from "../../types/events";
import { wsManager } from "../../../websocket/manager";
import { memoryService } from "../../../memory";
import { log, sendProgressUpdate } from "./utils";
import { recalculateConfidence } from "./gapFilling";
import { ValidationResult, CONFIDENCE_THRESHOLD } from "./types";
import { updateProjectUnderstanding } from "./projectUnderstanding";
import { generatePRD } from "./prdGenerator";

/**
 * Handle answers received from user
 * Simplified flow: validate → update doc → recalculate → continue or complete
 */
export async function handleAnswersReceived(
    context: Context,
    event: Event,
    callbacks: {
        incrementClarificationRound: (context: Context) => void;
        getClarificationRound: (context: Context) => number;
        completeScreen1: (context: Context) => Promise<void>;
        handleMaxRoundsReached: (context: Context, confidence: number) => Promise<void>;
        increaseConfidence: (context: Context, event: Event) => Promise<void>;
    }
): Promise<void> {
    log(`Answers received for ${context.projectId}`);
    const { answers } = event.payload.message;
    log(event, answers);

    // Step 1: Basic validation
    const validation = validateAnswers(answers);
    if (!validation.valid) {
        wsManager.sendMessage(context.projectId, {
            message: `⚠️ ${validation.message}`
        });
        return;
    }

    wsManager.sendFiller(context.projectId, 'Processing your answers...');

    // Step 2: Store answers in session memory
    await storeUserAnswers(context, answers);

    // Step 3: Format answers and update project understanding doc
    const answersText = formatAnswersForDoc(answers);
    await updateProjectUnderstanding(context, answersText, 'user_answer');

    // Step 4: Process answers and update confidence
    const { confidence, filledGaps } = await processAnswers(context, answers);

    // Track clarification round
    callbacks.incrementClarificationRound(context);
    const currentRound = callbacks.getClarificationRound(context);

    // Send progress update
    sendProgressUpdate(context, 'Answers processed', {
        confidence,
        filledGaps,
        clarificationRound: currentRound
    });

    // Step 5: Check if ready for PRD or need more enrichment
    if (confidence >= CONFIDENCE_THRESHOLD) {
        wsManager.sendMessage(context.projectId, {
            message: `✅ Confidence at ${confidence}%! Generating PRD...`
        });
        await generatePRD(context);
        await callbacks.completeScreen1(context);
    } else {
        // Continue enrichment - the callback will handle asking more questions
        await callbacks.increaseConfidence(context, event);
    }
}

/**
 * Format answers for the project understanding document
 */
function formatAnswersForDoc(answers: any[]): string {
    return answers.map(a => {
        const question = a.question || a.id || 'Question';
        return `**Q: ${question}**\nA: ${a.answer}`;
    }).join('\n\n');
}

/**
 * Validate user answers for completeness
 */
export function validateAnswers(answers: any[]): ValidationResult {
    log(`Validating answers ${answers}`);
    if (!answers || !Array.isArray(answers)) {
        return { valid: false, message: 'Invalid answer format. Please provide answers as an array.' };
    }

    if (answers.length === 0) {
        return { valid: false, message: 'No answers provided. Please answer at least one question.' };
    }

    // Check for empty answers
    const emptyAnswers = answers.filter(a => !a.answer || a.answer.trim() === '');
    if (emptyAnswers.length > 0) {
        return {
            valid: false,
            message: `Please provide answers for all questions. ${emptyAnswers.length} answer(s) are empty.`
        };
    }

    return { valid: true, message: 'Valid' };
}

/**
 * Store user answers in session memory
 */
export async function storeUserAnswers(context: Context, answers: any[]): Promise<void> {
    const existingAnswers = memoryService.getSession(context.projectId, 'user_answers');
    const allAnswers = existingAnswers
        ? [...JSON.parse(existingAnswers.content), ...answers]
        : answers;

    memoryService.setSession(context.projectId, 'user_answers', JSON.stringify(allAnswers));
    log(`Stored ${answers.length} answers (total: ${allAnswers.length})`);
}

/**
 * Process user answers and recalculate confidence
 * Simplified: just update gaps and recalculate
 */
export async function processAnswers(
    context: Context,
    answers: any[]
): Promise<{ confidence: number; filledGaps: string[] }> {
    log(`Processing ${answers.length} answers...`);

    // Load current analysis state
    const analysisStr = memoryService.getSession(context.projectId, 'initial_analysis');
    if (!analysisStr) {
        return { confidence: 0, filledGaps: [] };
    }

    const analysis = JSON.parse(analysisStr.content);
    const filledGaps: string[] = [];

    // Map answers to gaps
    for (const answer of answers) {
        const gapIndex = parseInt(answer.id?.replace('gap_', '')?.split('_')[0] || '0');
        if (!isNaN(gapIndex) && analysis.gaps && analysis.gaps[gapIndex]) {
            filledGaps.push(analysis.gaps[gapIndex]);
        }
    }

    // Combine existing filled gaps with new ones
    const existingFilledGaps = analysis.filledGaps || [];
    const allFilledGaps = [...existingFilledGaps, ...filledGaps.map(g => ({
        gap: g,
        resolution: answers.find(a => a.id?.includes(filledGaps.indexOf(g).toString()))?.answer || 'User provided',
        source: 'user_answer'
    }))];

    // Recalculate confidence with updated gaps
    const remainingGaps = (analysis.gaps || []).filter((g: string) =>
        !allFilledGaps.some((f: any) => f.gap === g)
    );

    const updatedConfidence = await recalculateConfidence(
        context,
        analysis.description,
        analysis.gaps,
        { filledGaps: allFilledGaps, unfillableGaps: remainingGaps }
    );

    // Update session memory with new state
    memoryService.setSession(context.projectId, 'initial_analysis', JSON.stringify({
        ...analysis,
        filledGaps: allFilledGaps,
        gaps: remainingGaps,
        confidence: updatedConfidence.confidence,
        reasoning: updatedConfidence.reasoning,
        timestamp: new Date().toISOString()
    }));

    context.planningData!.confidence = updatedConfidence.confidence;

    return {
        confidence: updatedConfidence.confidence,
        filledGaps
    };
}
