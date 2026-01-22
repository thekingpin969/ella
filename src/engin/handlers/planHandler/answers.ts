// planHandler/answers.ts
// User answer handling and processing

import { Context } from "../../types/context";
import { Event } from "../../types/events";
import { wsManager } from "../../../websocket/manager";
import { memoryService } from "../../../memory";
import { log, sendProgressUpdate } from "./utils";
import { recalculateConfidence } from "./gapFilling";
import { ValidationResult, ProcessedAnswersResult, CONFIDENCE_THRESHOLD, MAX_CLARIFICATION_ROUNDS } from "./types";

/**
 * Handle answers received from user
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
    const { answers } = event.payload;

    // Validate answers
    const validation = validateAnswers(answers);
    if (!validation.valid) {
        wsManager.sendMessage(context.projectId, {
            message: `⚠️ ${validation.message}`
        });
        return;
    }

    wsManager.sendFiller(context.projectId, 'Processing your answers...');

    // Store answers in session memory
    await storeUserAnswers(context, answers);

    // Process answers and update confidence
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

    // Evaluate if we can complete screen or need more clarification
    await evaluateScreenCompletion(context, confidence, currentRound, callbacks);
}

/**
 * Validate user answers for completeness
 */
export function validateAnswers(answers: any[]): ValidationResult {
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
 */
export async function processAnswers(
    context: Context,
    answers: any[]
): Promise<ProcessedAnswersResult> {
    log(`Processing ${answers.length} answers for ${context.projectId}`);

    // Load current analysis state
    const analysisStr = memoryService.getSession(context.projectId, 'initial_analysis');
    if (!analysisStr) {
        return { confidence: 0, filledGaps: [] };
    }

    const analysis = JSON.parse(analysisStr.content);
    const filledGaps: string[] = [];

    // Map answers to gaps (answers have id matching gap_X format)
    for (const answer of answers) {
        const gapIndex = parseInt(answer.id.replace('gap_', '').split('_')[0]);
        if (!isNaN(gapIndex) && analysis.gaps && analysis.gaps[gapIndex]) {
            filledGaps.push(analysis.gaps[gapIndex]);
        }
    }

    // Combine existing filled gaps with new ones from user
    const existingFilledGaps = analysis.filledGaps || [];
    const allFilledGaps = [...existingFilledGaps, ...filledGaps.map(g => ({
        gap: g,
        resolution: answers.find(a => a.id.includes(filledGaps.indexOf(g).toString()))?.answer || 'User provided',
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

/**
 * Evaluate if screen can be completed or needs more clarification
 */
async function evaluateScreenCompletion(
    context: Context,
    confidence: number,
    currentRound: number,
    callbacks: {
        completeScreen1: (context: Context) => Promise<void>;
        handleMaxRoundsReached: (context: Context, confidence: number) => Promise<void>;
        increaseConfidence: (context: Context, event: Event) => Promise<void>;
    }
): Promise<void> {
    if (confidence >= CONFIDENCE_THRESHOLD) {
        wsManager.sendMessage(context.projectId, {
            message: `✅ Confidence at ${confidence}%! Ready to complete this phase.`
        });
        await callbacks.completeScreen1(context);
    } else if (currentRound >= MAX_CLARIFICATION_ROUNDS) {
        await callbacks.handleMaxRoundsReached(context, confidence);
    } else {
        wsManager.sendLog(context.projectId,
            `Confidence ${confidence}% < ${CONFIDENCE_THRESHOLD}%. Round ${currentRound}/${MAX_CLARIFICATION_ROUNDS}. Continuing clarification...`);
        await callbacks.increaseConfidence(context, {} as Event);
    }
}
