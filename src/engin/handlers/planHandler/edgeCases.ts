// planHandler/edgeCases.ts
// Edge case handlers: override, abort, and special scenarios

import { Context } from "../../types/context";
import { Event } from "../../types/events";
import { wsManager } from "../../../websocket/manager";
import { memoryService } from "../../../memory";
import { log } from "./utils";

/**
 * Handle user override (force next screen at low confidence)
 */
export async function handleUserOverride(
    context: Context,
    event: Event,
    completeScreen1: (context: Context) => Promise<void>
): Promise<void> {
    const { force } = event.payload || {};

    if (force === true) {
        const confidence = context.planningData?.confidence || 0;
        log(`User forcing screen completion at ${confidence}% confidence`);

        wsManager.sendMessage(context.projectId, {
            message: `⚠️ Proceeding with ${confidence}% confidence. Some implementation details may require clarification later.`
        });

        await completeScreen1(context);
    } else {
        wsManager.sendMessage(context.projectId, {
            message: 'To force proceed, please confirm with force:true in your request.'
        });
    }
}

/**
 * Handle abort/restart planning
 */
export async function handleAbort(context: Context): Promise<void> {
    log(`Aborting planning for ${context.projectId}`);

    // Clear all session memory for this project
    memoryService.clearSession(context.projectId);

    // Reset planning data
    if (context.planningData) {
        context.planningData.currentScreen = 1;
        context.planningData.confidence = 0;
        context.planningData.messages = [];
        context.planningData.clarificationRound = 0;
        context.planningData.askedQuestionIds = [];
    }

    // Clear artifacts
    context.artifacts = [];

    wsManager.sendMessage(context.projectId, {
        message: '🔄 Planning session reset. You can start over with a new description.'
    });

    wsManager.broadcast(context.projectId, {
        type: 'update',
        timestamp: new Date().toISOString(),
        data: {
            message: 'Planning session reset',
            reset: true
        }
    });
}

/**
 * Handle user message from WebSocket
 */
export async function handleUserMessage(
    context: Context,
    userMessage: string
): Promise<void> {
    log('message received..., handling it');
    wsManager.sendLog(context.projectId, 'Processing user message...');
    wsManager.sendMessage(context.projectId, { message: 'ok i will wait...' });
}
