// planHandler/utils.ts
// Shared utility functions

import { Context } from "../../types/context";
import { wsManager } from "../../../websocket/manager";
import { llmService } from "../../../llm";
import { logger } from "../../../utils/logger";

/**
 * Log with PlanHandler prefix
 */
export function log(...message: any): void {
    logger.info(`[PlanHandler] `, message);
}

/**
 * Wrapper for LLM calls with WebSocket logging
 */
export async function callLLMWithLogging(
    projectId: string,
    stepName: string,
    messages: any[],
    options: any = {}
): Promise<any> {
    wsManager.sendLog(projectId, `🤖 LLM Request: ${stepName}`, { messages, options });

    const startTime = Date.now();
    try {
        const response = await llmService.chat({
            messages,
            ...options
        });
        const duration = Date.now() - startTime;

        wsManager.sendLog(projectId, `🤖 LLM Response: ${stepName} (${duration}ms)`, {
            content: response.content,
            tool_calls: response.tool_calls
        });

        return response;
    } catch (error: any) {
        wsManager.sendLog(projectId, `❌ LLM Error: ${stepName}`, { error: error.message });
        throw error;
    }
}

/**
 * Parse JSON from LLM response (handles markdown code fences)
 */
export function parseJSONResponse(content: string): any {
    try {
        const cleaned = content
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        return JSON.parse(cleaned);
    } catch (error) {
        log(`Failed to parse JSON: ${content}`);
        throw new Error('Invalid JSON response from LLM');
    }
}

/**
 * Retry wrapper for operations that may fail
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    projectId: string,
    operationName: string,
    maxRetries: number = 3
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;
            log(`${operationName} failed (attempt ${attempt}/${maxRetries}): ${error.message}`);
            wsManager.sendLog(projectId,
                `⚠️ ${operationName} failed (attempt ${attempt}/${maxRetries})`,
                { error: error.message }
            );

            if (attempt < maxRetries) {
                // Exponential backoff: 1s, 2s, 4s
                await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
            }
        }
    }

    // All retries failed
    wsManager.sendMessage(projectId, {
        message: `❌ ${operationName} failed after ${maxRetries} attempts. Please try again.`
    });
    throw lastError!;
}

/**
 * Send progress update to client
 */
export function sendProgressUpdate(context: Context, stage: string, details: any): void {
    wsManager.broadcast(context.projectId, {
        type: 'update',
        timestamp: new Date().toISOString(),
        data: {
            message: stage,
            progress: details.confidence || context.planningData?.confidence || 0,
            filledGaps: details.filledGaps || [],
            remainingGaps: details.remainingGaps || [],
            clarificationRound: details.clarificationRound || context.planningData?.clarificationRound || 0
        }
    });
}
