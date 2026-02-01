// uiuxHandler/utils.ts
// Shared utilities for Screen 2: UI/UX Deep Dive

import { wsManager } from "../../../websocket/manager";
import { llmService } from "../../../llm";
import { logger } from "../../../utils/logger";

const DEBUG = true;

/**
 * Log utility with prefix
 */
export function log(message: string | object): void {
    if (DEBUG) {
        if (typeof message === 'string') {
            logger.info(`[UIUXHandler] ${message}`);
        } else {
            logger.info('[UIUXHandler]', message);
        }
    }
}

/**
 * Call LLM with logging for debugging
 */
export async function callLLMWithLogging(
    projectId: string,
    purpose: string,
    messages: Array<{ role: string; content: string }>,
    options: { temperature?: number; max_tokens?: number } = {}
): Promise<{ content: string }> {
    log(`LLM Call: ${purpose}`);
    wsManager.sendLog(projectId, `LLM: ${purpose}`, { messages, options });

    try {
        const response = await llmService.chat({
            messages: messages as any,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.max_tokens ?? 2000
        });

        log(`LLM Response received for: ${purpose}`);
        return { content: response.content || '' };
    } catch (error: any) {
        log(`LLM Error in ${purpose}: ${error.message}`);
        throw error;
    }
}

/**
 * Retry wrapper for async operations
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
            log(`Retry ${attempt}/${maxRetries} for ${operationName}: ${error.message}`);

            if (attempt < maxRetries) {
                await sleep(1000 * attempt); // Exponential backoff
            }
        }
    }

    wsManager.sendLog(projectId, `Failed after ${maxRetries} retries: ${operationName}`, { error: lastError?.message });
    throw lastError;
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse JSON safely with fallback
 */
export function safeJSONParse<T>(str: string, fallback: T): T {
    try {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[1]);
        }
        return JSON.parse(str);
    } catch {
        return fallback;
    }
}

/**
 * Extract content between markers
 */
export function extractBetweenMarkers(
    content: string,
    startMarker: string,
    endMarker: string
): string | null {
    const startIndex = content.indexOf(startMarker);
    if (startIndex === -1) return null;

    const endIndex = content.indexOf(endMarker, startIndex + startMarker.length);
    if (endIndex === -1) return null;

    return content.substring(startIndex + startMarker.length, endIndex).trim();
}

/**
 * Clean HTML by removing markdown code fences
 */
export function cleanHTML(content: string): string {
    // Remove ```html and ``` markers
    let cleaned = content.replace(/```html\s*/gi, '');
    cleaned = cleaned.replace(/```\s*/g, '');
    return cleaned.trim();
}

/**
 * Clean CSS by removing markdown code fences
 */
export function cleanCSS(content: string): string {
    // Remove ```css and ``` markers
    let cleaned = content.replace(/```css\s*/gi, '');
    cleaned = cleaned.replace(/```\s*/g, '');
    return cleaned.trim();
}

/**
 * Calculate confidence score based on completed phases
 */
export function calculateConfidenceScore(
    moodLocked: boolean,
    inspirationLocked: boolean,
    approvedScreensCount: number,
    totalScreens: number,
    tokensExtracted: boolean,
    artifactsGenerated: boolean
): number {
    let score = 0;

    // Mood: 20%
    if (moodLocked) score += 20;

    // Inspiration: 20%
    if (inspirationLocked) score += 20;

    // Screens: 40% (proportional to approved screens)
    if (totalScreens > 0) {
        score += Math.floor((approvedScreensCount / totalScreens) * 40);
    }

    // Tokens: 10%
    if (tokensExtracted) score += 10;

    // Artifacts: 10%
    if (artifactsGenerated) score += 10;

    return score;
}
