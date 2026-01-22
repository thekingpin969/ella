// planHandler/gapFilling.ts
// Gap filling research and confidence recalculation

import { Context } from "../../types/context";
import { wsManager } from "../../../websocket/manager";
import { memoryService } from "../../../memory";
import { PROMPTS } from "../../prompts/prompts";
import { toolExecutor } from "../../../tools";
import { callLLMWithLogging, parseJSONResponse, log } from "./utils";
import { GapFillingResult, GapClassification, FilledGap, RecalculatedConfidence } from "./types";

/**
 * Conduct gap filling research autonomously
 */
export async function conductGapFillingResearch(
    context: Context,
    description: string,
    gaps: string[]
): Promise<GapFillingResult> {
    try {
        log(`Starting gap filling for ${gaps.length} gaps...`);
        wsManager.sendLog(context.projectId, `Starting research for ${gaps.length} gaps...`, { gaps });

        // Step 1: Identify which gaps are fillable vs unfillable
        wsManager.sendFiller(context.projectId, "Classifying gaps...");
        const { fillable, unfillable } = await identifyFillableGaps(context, description, gaps);

        log(`Identified ${fillable.length} fillable gaps and ${unfillable.length} unfillable gaps.`);
        wsManager.sendLog(context.projectId, `Gap classification complete.`, {
            fillableCount: fillable.length,
            unfillableCount: unfillable.length,
            fillable,
            unfillable
        });

        // Step 2: Parallel execution for fillable gaps
        wsManager.sendFiller(context.projectId, `Reasoning about ${fillable.length} technical gaps...`);

        const filledResults = await Promise.all(
            fillable.map(async (gapItem) => {
                return fillGap(context, description, gapItem.gap);
            })
        );

        return {
            filledGaps: filledResults,
            unfillableGaps: unfillable.map(u => u.gap)
        };

    } catch (error: any) {
        log(`Error in gap filling research: ${error.message}`);
        return {
            filledGaps: [],
            unfillableGaps: gaps
        };
    }
}

/**
 * Classify gaps into fillable (technical) and unfillable (business)
 */
export async function identifyFillableGaps(
    context: Context,
    description: string,
    gaps: string[]
): Promise<GapClassification> {
    try {
        const response = await callLLMWithLogging(
            context.projectId,
            "Gap Classification",
            [
                { role: "system", content: PROMPTS.GAP_CLASSIFICATION_PROMPT },
                { role: "user", content: JSON.stringify({ description, gaps }) }
            ],
            { temperature: 0.1, max_tokens: 4000 }
        );

        const parsed = parseJSONResponse(response.content || "{}");
        return {
            fillable: parsed.fillable || [],
            unfillable: parsed.unfillable || []
        };
    } catch (error) {
        log("Error identifying fillable gaps", error);
        return {
            fillable: [],
            unfillable: gaps.map(g => ({ gap: g, reason: "Error in classification" }))
        };
    }
}

/**
 * Fill a single gap using research tools
 */
export async function fillGap(
    context: Context,
    description: string,
    gap: string
): Promise<FilledGap> {
    try {
        log(`Filling gap: ${gap}`);
        wsManager.sendLog(context.projectId, `Researching gap: ${gap}...`);

        const response = await callLLMWithLogging(
            context.projectId,
            `Research Gap: ${gap}`,
            [
                {
                    role: "system",
                    content: PROMPTS.SINGLE_GAP_FILLING_PROMPT
                        .replace("{{GAP}}", gap)
                        .replace("{{DESCRIPTION}}", description)
                }
            ],
            {
                tools: toolExecutor.getToolDefinitions(),
                tool_choice: "auto",
                temperature: 0.4,
                max_tokens: 4000
            }
        );

        // Handle tool calls if E.L.L.A decided to research
        if (response.tool_calls && response.tool_calls.length > 0) {
            wsManager.sendLog(context.projectId, `Executing tools for gap: ${gap}`, { tool_calls: response.tool_calls });

            const toolCalls = toolExecutor.parseToolCalls(response);
            const toolResults = await toolExecutor.executeTools(toolCalls, context);
            const toolMessages = toolExecutor.formatToolResponses(toolResults);

            wsManager.sendLog(context.projectId, `Tool results for gap: ${gap}`, { toolResults });

            const finalResponse = await callLLMWithLogging(
                context.projectId,
                `Research Gap (Post-Tool): ${gap}`,
                [
                    {
                        role: "system",
                        content: PROMPTS.SINGLE_GAP_FILLING_PROMPT
                            .replace("{{GAP}}", gap)
                            .replace("{{DESCRIPTION}}", description)
                    },
                    {
                        role: "assistant",
                        content: response.content || "",
                        tool_calls: response.tool_calls
                    },
                    ...toolMessages.map(tm => ({
                        role: "tool" as const,
                        content: tm.content,
                        tool_call_id: tm.tool_call_id,
                        name: tm.name
                    }))
                ],
                { temperature: 0.4 }
            );

            const parsed = parseJSONResponse(finalResponse.content || "{}");
            wsManager.sendLog(context.projectId, `Gap resolved (with tools)`, { gap, resolution: parsed.resolution });

            return {
                gap,
                resolution: parsed.resolution || "Could not resolve",
                source: parsed.source || "research"
            };
        }

        // Direct response
        const parsed = parseJSONResponse(response.content || "{}");
        wsManager.sendLog(context.projectId, `Gap resolved (direct)`, { gap, resolution: parsed.resolution });

        return {
            gap,
            resolution: parsed.resolution || "Could not resolve",
            source: parsed.source || "research"
        };

    } catch (error: any) {
        log(`Failed to fill gap: ${gap}`, error);
        return {
            gap,
            resolution: "Failed to resolve due to error",
            source: "error"
        };
    }
}

/**
 * Recalculate confidence with filled gaps
 */
export async function recalculateConfidence(
    context: Context,
    description: string,
    originalGaps: string[],
    gapFillingResult: GapFillingResult
): Promise<RecalculatedConfidence> {
    try {
        wsManager.sendFiller(context.projectId, "Recalculating confidence metrics...");

        const response = await callLLMWithLogging(
            context.projectId,
            "Recalculate Confidence",
            [
                { role: "system", content: PROMPTS.CONFIDENCE_SYSTEM_PROMPT },
                {
                    role: "user",
                    content: JSON.stringify({
                        description,
                        original_gaps: originalGaps,
                        filled_gaps: gapFillingResult.filledGaps,
                        remaining_gaps: gapFillingResult.unfillableGaps
                    })
                }
            ],
            { temperature: 0.1, max_tokens: 10000 }
        );

        const parsed = parseJSONResponse(response.content || "{}");

        return {
            confidence: parsed.confidence || 50,
            reasoning: parsed.reasoning || "Confidence updated with research",
            remainingGaps: gapFillingResult.unfillableGaps
        };

    } catch (error: any) {
        log(`Error recalculating confidence: ${error.message}`);
        return {
            confidence: 50,
            reasoning: "Error during confidence calculation",
            remainingGaps: gapFillingResult.unfillableGaps
        };
    }
}

/**
 * Summarize research findings for display
 */
export function summarizeResearch(filledGaps: Array<{ gap: string; resolution: string }>): string {
    if (filledGaps.length === 0) return "";

    let summary = "📊 Research Findings:\n\n";
    filledGaps.forEach((filled, index) => {
        summary += `${index + 1}. ${filled.gap}\n`;
        summary += `   ✓ ${filled.resolution}\n\n`;
    });

    return summary;
}
