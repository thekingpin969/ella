// planHandler/clarification.ts
// Clarification loop tracking and question handling

import { Context } from "../../types/context";
import { wsManager } from "../../../websocket/manager";
import { memoryService } from "../../../memory";
import { log } from "./utils";
import { MAX_CLARIFICATION_ROUNDS } from "./types";

/**
 * Increment clarification round counter
 */
export function incrementClarificationRound(context: Context): void {
    if (!context.planningData) return;
    context.planningData.clarificationRound = (context.planningData.clarificationRound || 0) + 1;

    memoryService.setSession(
        context.projectId,
        'clarification_round',
        String(context.planningData.clarificationRound)
    );
}

/**
 * Get current clarification round
 */
export function getClarificationRound(context: Context): number {
    return context.planningData?.clarificationRound || 0;
}

/**
 * Get list of already-asked question IDs
 */
export function getAskedQuestions(context: Context): string[] {
    const asked = memoryService.getSession(context.projectId, 'asked_questions');
    return asked ? JSON.parse(asked.content) : [];
}

/**
 * Ask clarifying questions with smart deduplication
 */
export async function askClarifyingQuestions(
    context: Context,
    unfillableGaps: string[]
): Promise<void> {
    if (unfillableGaps.length === 0) return;

    // Get previously asked questions to avoid duplicates
    const askedBefore = getAskedQuestions(context);
    const newGaps = unfillableGaps.filter(g => !askedBefore.includes(g));

    if (newGaps.length === 0) {
        // All questions already asked
        await handleNoNewQuestions(context);
        return;
    }

    // Generate questions from new gaps only
    const timestamp = Date.now();
    const questions = newGaps.map((gap, index) => ({
        id: `gap_${index}_${timestamp}`,
        text: gapToQuestion(gap),
        type: "text" as const,
        options: generateOptionsForGap(gap) // Add suggested options for common questions
    }));

    // Store asked questions to prevent re-asking
    memoryService.setSession(
        context.projectId,
        'asked_questions',
        JSON.stringify([...askedBefore, ...newGaps])
    );

    // Track question IDs in planning data
    if (context.planningData) {
        context.planningData.askedQuestionIds = [
            ...(context.planningData.askedQuestionIds || []),
            ...questions.map(q => q.id)
        ];
    }

    log(`Asking ${questions.length} new questions (${askedBefore.length} already asked)`);
    wsManager.askQuestion(context.projectId, { questions });
}

/**
 * Convert gap to question format
 */
export function gapToQuestion(gap: string): string {
    return gap.replace(/unclear|not specified|undefined|missing/gi, '')
        .trim() + '?';
}

/**
 * Generate smart options for common question types
 */
function generateOptionsForGap(gap: string): string[] | undefined {
    const lowerGap = gap.toLowerCase();

    // Authentication-related questions
    if (lowerGap.includes('auth') || lowerGap.includes('login') || lowerGap.includes('sign in')) {
        return ['OAuth 2.0', 'JWT', 'Session-based', 'Custom'];
    }

    // Database-related questions
    if (lowerGap.includes('database') || lowerGap.includes('storage') || lowerGap.includes('data store')) {
        return ['PostgreSQL', 'MongoDB', 'MySQL', 'Firebase'];
    }

    // UI framework questions
    if (lowerGap.includes('frontend') || lowerGap.includes('ui framework') || lowerGap.includes('client')) {
        return ['React', 'Vue', 'Angular', 'Svelte'];
    }

    // Backend framework questions
    if (lowerGap.includes('backend') || lowerGap.includes('server') || lowerGap.includes('api')) {
        return ['Express', 'FastAPI', 'Django', 'Spring Boot'];
    }

    // Deployment/hosting questions
    if (lowerGap.includes('deploy') || lowerGap.includes('host') || lowerGap.includes('cloud')) {
        return ['AWS', 'Google Cloud', 'Azure', 'Vercel'];
    }

    // Payment-related questions
    if (lowerGap.includes('payment') || lowerGap.includes('billing') || lowerGap.includes('subscription')) {
        return ['Stripe', 'PayPal', 'Square', 'Custom'];
    }

    // Mobile platform questions
    if (lowerGap.includes('mobile') || lowerGap.includes('platform')) {
        return ['iOS', 'Android', 'Both', 'Web-only'];
    }

    // No specific options - let user type freely
    return undefined;
}

/**
 * Handle max clarification rounds reached
 */
export async function handleMaxRoundsReached(
    context: Context,
    confidence: number
): Promise<void> {
    wsManager.sendMessage(context.projectId, {
        message: `⚠️ We've gone through ${MAX_CLARIFICATION_ROUNDS} clarification rounds and confidence is at ${confidence}%. You can:\n\n1. **Provide more details** to increase confidence\n2. **Force proceed** to the next phase (some implementation may require guessing)\n\nTo force proceed, send a message with "force:true".`
    });

    wsManager.broadcast(context.projectId, {
        type: 'update',
        timestamp: new Date().toISOString(),
        data: {
            message: 'Max clarification rounds reached',
            confidence,
            canOverride: true,
            clarificationRound: MAX_CLARIFICATION_ROUNDS
        }
    });
}

/**
 * Handle when there are no new questions to ask
 */
export async function handleNoNewQuestions(context: Context): Promise<void> {
    const confidence = context.planningData?.confidence || 0;

    wsManager.sendMessage(context.projectId, {
        message: `I've asked all the questions I have. Current confidence is ${confidence}%. Would you like to proceed anyway or provide additional context?`
    });
}
