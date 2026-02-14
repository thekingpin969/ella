// src/llm/providers/nvidia/handlers/index.ts
import { ModelHandler } from "../types";
import { openaiHandler } from "./openaiHandler";
import { minimaxHandler } from "./minimaxHandler";
import { glmHandler } from "./glmHandler";

/**
 * Registry of all available model handlers
 * Add new handlers here as they are implemented
 */
export const modelHandlers: ModelHandler[] = [
    minimaxHandler,
    glmHandler,
    openaiHandler, // OpenAI handler is last as fallback
];

/**
 * Get the appropriate handler for a given model
 * Matches against model patterns in order of registration
 * 
 * @param model - The model identifier (e.g., "minimaxai/minimax-m2")
 * @returns The matching handler, or openaiHandler as fallback
 */
export function getHandler(model: string): ModelHandler {
    for (const handler of modelHandlers) {
        if (handler.modelPattern.test(model)) {
            return handler;
        }
    }
    // Default to OpenAI-compatible handler
    return openaiHandler;
}

export { openaiHandler, minimaxHandler, glmHandler };
