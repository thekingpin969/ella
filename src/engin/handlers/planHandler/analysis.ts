// planHandler/analysis.ts
// Initial analysis and gap identification

import { Context } from "../../types/context";
import { wsManager } from "../../../websocket/manager";
import { memoryService } from "../../../memory";
import { PROMPTS } from "../../prompts/prompts";
import { callLLMWithLogging, parseJSONResponse, log } from "./utils";
import { AnalysisResult, ConfidenceResult } from "./types";
import { getCachedStage, setCachedStage, CacheKey, isStageCachingEnabled } from "./stageCache";

/**
 * Perform initial analysis of project description
 */
export async function performInitialAnalysis(
    context: Context,
    description: string,
    onLowConfidence: (context: Context) => Promise<void>
): Promise<void> {
    log(`Starting initial analysis for ${context.projectId}`);
    wsManager.sendFiller(context.projectId, 'analyzing project...');

    try {
        // Step 1: Get analysis and gaps
        const analysis = await createInitialContext(context, description);
        log(analysis);
        wsManager.sendLog(context.projectId, 'Initial analysis generated', { analysis });

        // Step 2: Calculate confidence
        const { confidence, reasoning } = await calculateConfidence(
            context,
            description,
            analysis.gaps
        );
        log(confidence, reasoning);
        wsManager.sendLog(context.projectId, `Initial confidence calculated: ${confidence}%`, { reasoning });

        // Step 3: Store in context
        context.planningData!.confidence = confidence;

        // Step 4: Store in session memory
        memoryService.setSession(context.projectId, 'initial_analysis', JSON.stringify({
            description,
            gaps: analysis.gaps,
            confidence,
            reasoning,
            timestamp: new Date().toISOString()
        }));

        // Step 5: Send message to user
        wsManager.sendMessage(context.projectId, { message: analysis.message });

        log(`Initial analysis complete: ${confidence}% confidence`);

        // Step 6: Check if we need to increase confidence
        if (confidence < 90) {
            log('Confidence is low, trying to increase confidence');
            await onLowConfidence(context);
        } else {
            log('Have enough confidence to move to the next step');
        }

    } catch (error: any) {
        log(`Error in initial analysis: ${error.message}`);
        wsManager.sendMessage(context.projectId, {
            message: "I encountered an issue analyzing your project. Could you provide more details?"
        });
    }
}

/**
 * Create initial context with gap analysis
 */
export async function createInitialContext(
    context: Context,
    description: string
): Promise<AnalysisResult> {
    // Check cache first
    const cached = getCachedStage<AnalysisResult>(context, CacheKey.GAPS_GENERATED);
    if (cached) {
        log(`🚀 Using cached gaps (${cached.gaps.length} gaps)`);
        wsManager.sendLog(context.projectId, '⚡ Loaded gaps from cache', { gaps: cached.gaps });
        return cached;
    }

    try {
        const response = await callLLMWithLogging(
            context.projectId,
            "Initial Analysis",
            [
                { role: "system", content: PROMPTS.ANALYSIS_SYSTEM_PROMPT },
                { role: "user", content: description }
            ],
            { temperature: 0.7, max_tokens: 10000 }
        );

        if (!response.content) {
            throw new Error("Empty response from LLM");
        }

        const parsed = parseJSONResponse(response.content);

        if (!parsed.gaps || !Array.isArray(parsed.gaps)) {
            throw new Error("Invalid response format: missing gaps array");
        }
        if (!parsed.message || typeof parsed.message !== 'string') {
            throw new Error("Invalid response format: missing message");
        }

        const result: AnalysisResult = {
            gaps: parsed.gaps,
            message: parsed.message
        };

        // Cache the result
        setCachedStage(context, CacheKey.GAPS_GENERATED, result);

        return result;

    } catch (error: any) {
        log(`Error in createInitialContext: ${error.message}`);
        return {
            gaps: ["Unable to analyze - please provide more details"],
            message: "I encountered an issue analyzing your description. Could you provide more details about your project?"
        };
    }
}

/**
 * Calculate confidence score for project
 */
export async function calculateConfidence(
    context: Context,
    description: string,
    gaps: string[]
): Promise<ConfidenceResult> {
    // Check cache first
    const cached = getCachedStage<ConfidenceResult>(context, CacheKey.CONFIDENCE_CALCULATED);
    if (cached) {
        log(`🚀 Using cached confidence: ${cached.confidence}%`);
        wsManager.sendLog(context.projectId, '⚡ Loaded confidence from cache', { confidence: cached.confidence });
        return cached;
    }

    try {
        const response = await callLLMWithLogging(
            context.projectId,
            "Calculate Confidence",
            [
                { role: "system", content: PROMPTS.CONFIDENCE_SYSTEM_PROMPT },
                {
                    role: "user",
                    content: JSON.stringify({
                        description,
                        identified_gaps: gaps
                    })
                }
            ],
            { temperature: 0.1, max_tokens: 10000 }
        );

        if (!response.content) {
            throw new Error("Empty response from LLM");
        }

        const parsed = parseJSONResponse(response.content);

        if (typeof parsed.confidence !== 'number') {
            throw new Error("Invalid response: confidence must be a number");
        }
        if (parsed.confidence < 0 || parsed.confidence > 100) {
            throw new Error("Invalid response: confidence must be between 0-100");
        }

        const result: ConfidenceResult = {
            confidence: parsed.confidence,
            reasoning: parsed.reasoning || "No reasoning provided"
        };

        // Cache the result
        setCachedStage(context, CacheKey.CONFIDENCE_CALCULATED, result);

        return result;

    } catch (error: any) {
        log(`Error in calculateConfidence: ${error.message}`);
        return {
            confidence: 30,
            reasoning: "Unable to calculate confidence accurately"
        };
    }
}
