// src/engin/handlers/PlanHandler.ts (ENHANCED)
import { BaseHandler } from "./BaseHandler";
import { Context } from "../types/context";
import { Event } from "../types/events";
import { wsManager } from "../../websocket/manager";
import { llmService } from "../../llm";
import { memoryService } from "../../memory";
import { PROMPTS } from "../prompts/prompts";
import { toolExecutor } from "../../tools";

export class PlanHandler extends BaseHandler {

    handle(context: Context, event: Event): void {
        this.log(`Handling event: ${event.name}`);

        switch (event.name) {
            case "context_created":
                this.onContextCreated(context, event);
                break;
            case "start_initial_analysis":
                this.performInitialAnalysis(context, event);
                break;
            case "user_response":
                this.onUserResponse(context, event);
                break;
            case "screen_complete":
                this.onScreenComplete(context, event);
                break;
        }
    }

    private onUserResponse(context: Context, event: Event): void {
        switch (event.name!) {
            case "answers_received":
                this.onAnswerReceived(context, event);
                break;
            case "websocket_message":
                this.onWebSocketMessage(context, event);
                break;
            default:
                this.log(`Unknown event: ${event.name}`);
                break;
        }
    }

    private async onAnswerReceived(context: Context, event: Event): Promise<void> {
        this.log(`Answers received for ${context.projectId}`);
        const { answers } = event.payload!
        this.log(`Answers: ${answers}`);
        const { confidence } = await this.updateContext(context, answers)
        this.log(`Updated context: ${confidence}`);
        if (confidence < 95) {
            this.log('confidence is low, trying to increase confidence')
            await this.increaceConfidence(context, event)
        } else {
            this.log('have enough confidence to move to the next step')
        }
    }

    private async updateContext(context: Context, answers: any[]): Promise<{ confidence: number; }> {
        this.log(`Updating context for ${context.projectId}`);
        return {
            confidence: 40
        }
    }

    /**
     * ENHANCED: Increase confidence through autonomous research and clarification
     */
    private async increaceConfidence(context: Context, event: Event): Promise<void> {
        this.log('Starting autonomous gap-filling process...')

        // Step 1: Load current state from session memory
        const initialAnalysisStr = memoryService.getSession(context.projectId, 'initial_analysis')
        if (!initialAnalysisStr) {
            this.log('No initial analysis found')
            return
        }

        const initialAnalysis = JSON.parse(initialAnalysisStr.content)
        const { description, gaps, confidence: currentConfidence } = initialAnalysis

        // Step 2: Ask E.L.L.A to research and fill gaps autonomously
        wsManager.sendFiller(context.projectId, 'analyzing gaps and conducting research...')

        const gapFillingResult = await this.conductGapFillingResearch(
            context,
            description,
            gaps
        )

        // Step 3: Recalculate confidence with filled gaps
        wsManager.sendFiller(context.projectId, 'updating confidence with research findings...')

        const updatedConfidence = await this.recalculateConfidence(
            context,
            description,
            gaps,
            gapFillingResult
        )

        this.log(`Confidence updated: ${currentConfidence}% → ${updatedConfidence.confidence}%`)

        // Update session memory
        memoryService.setSession(context.projectId, 'initial_analysis', JSON.stringify({
            description,
            gaps: updatedConfidence.remainingGaps,
            filledGaps: gapFillingResult.filledGaps,
            confidence: updatedConfidence.confidence,
            reasoning: updatedConfidence.reasoning,
            timestamp: new Date().toISOString()
        }))

        // Step 4: Check if we still need user input
        if (updatedConfidence.confidence >= 90) {
            wsManager.sendMessage(context.projectId, {
                message: `✅ Research complete! Confidence now at ${updatedConfidence.confidence}%. Ready to proceed.`
            })

            // Show what was researched
            if (gapFillingResult.filledGaps.length > 0) {
                const summary = this.summarizeResearch(gapFillingResult.filledGaps)
                wsManager.sendMessage(context.projectId, { message: summary })
            }
        } else {
            // Still need user input for business decisions
            wsManager.sendMessage(context.projectId, {
                message: `I've researched technical details (confidence: ${updatedConfidence.confidence}%), but I need your input on some business decisions.`
            })

            await this.askClarifyingQuestions(context, updatedConfidence.remainingGaps)
        }
    }

    /**
     * NEW: Let E.L.L.A autonomously research gaps using available tools
     */
    private async conductGapFillingResearch(
        context: Context,
        description: string,
        gaps: string[]
    ): Promise<{
        filledGaps: Array<{ gap: string, resolution: string, source: string }>,
        unfillableGaps: string[]
    }> {
        try {
            const response = await llmService.chat({
                messages: [
                    {
                        role: "system",
                        content: PROMPTS.GAP_FILLING_PROMPT
                    },
                    {
                        role: "user",
                        content: JSON.stringify({
                            description,
                            gaps,
                        })
                    }
                ],
                tools: toolExecutor.getToolDefinitions(),
                tool_choice: "auto",
                temperature: 0.4,
                max_tokens: 16000
            })

            // Handle tool calls if E.L.L.A decided to research
            if (response.tool_calls && response.tool_calls.length > 0) {
                this.log(`E.L.L.A is using ${response.tool_calls.length} tools to research gaps`)
                this.log(`Tool calls: ${JSON.stringify(response.tool_calls)}`)
                // Execute tools
                const toolCalls = toolExecutor.parseToolCalls(response)
                const toolResults = await toolExecutor.executeTools(toolCalls, context)

                this.log(toolCalls, `Tool results: ${JSON.stringify(toolResults)}`)

                // Get final response with research results
                const toolMessages = toolExecutor.formatToolResponses(toolResults)

                const finalResponse = await llmService.chat({
                    messages: [
                        {
                            role: "system",
                            content: PROMPTS.GAP_FILLING_PROMPT
                        },
                        {
                            role: "user",
                            content: JSON.stringify({ description, gaps })
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
                    tools: toolExecutor.getToolDefinitions(),
                    tool_choice: "auto",
                    temperature: 0.4,
                    max_tokens: 16000
                })
                this.log(finalResponse, [
                    {
                        role: "system",
                        content: PROMPTS.GAP_FILLING_PROMPT
                    },
                    {
                        role: "user",
                        content: JSON.stringify({ description, gaps })
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
                ])
                return this.parseGapFillingResult(finalResponse.content || "")
            }

            // No tools used - parse direct response
            return this.parseGapFillingResult(response.content || "")

        } catch (error: any) {
            this.log(`Error in gap filling research: ${error.message}`)
            return {
                filledGaps: [],
                unfillableGaps: gaps
            }
        }
    }
    /**
     * NEW: Parse gap filling result from LLM response
     */
    private parseGapFillingResult(content: string): {
        filledGaps: Array<{ gap: string, resolution: string, source: string }>,
        unfillableGaps: string[]
    } {
        try {
            const cleaned = content
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim()

            const parsed = JSON.parse(cleaned)

            return {
                filledGaps: parsed.filledGaps || [],
                unfillableGaps: parsed.unfillableGaps || []
            }
        } catch (error) {
            this.log('Failed to parse gap filling result, returning empty', error)
            return {
                filledGaps: [],
                unfillableGaps: []
            }
        }
    }

    /**
     * NEW: Recalculate confidence with filled gaps
     */
    private async recalculateConfidence(
        context: Context,
        description: string,
        originalGaps: string[],
        gapFillingResult: any
    ): Promise<{
        confidence: number,
        reasoning: string,
        remainingGaps: string[]
    }> {
        try {
            const response = await llmService.chat({
                messages: [
                    {
                        role: "system",
                        content: PROMPTS.CONFIDENCE_SYSTEM_PROMPT
                    },
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
                temperature: 0.3,
                max_tokens: 10000
            })

            const parsed = this.parseJSONResponse(response.content || "{}")

            return {
                confidence: parsed.confidence || 50,
                reasoning: parsed.reasoning || "Confidence updated with research",
                remainingGaps: gapFillingResult.unfillableGaps
            }

        } catch (error: any) {
            this.log(`Error recalculating confidence: ${error.message}`)
            return {
                confidence: 50,
                reasoning: "Error during confidence calculation",
                remainingGaps: gapFillingResult.unfillableGaps
            }
        }
    }

    /**
     * NEW: Ask clarifying questions for unfillable gaps
     */
    private async askClarifyingQuestions(
        context: Context,
        unfillableGaps: string[]
    ): Promise<void> {
        if (unfillableGaps.length === 0) return

        // Generate questions from gaps
        const questions = unfillableGaps.map((gap, index) => ({
            id: `gap_${index}`,
            text: this.gapToQuestion(gap),
            type: "text" as const
        }))

        wsManager.askQuestion(context.projectId, { questions })
    }

    /**
     * Helper: Convert gap to question
     */
    private gapToQuestion(gap: string): string {
        // Simple conversion - can be enhanced
        return gap.replace(/unclear|not specified|undefined|missing/gi, '')
            .trim() + '?'
    }

    /**
     * Helper: Summarize research findings
     */
    private summarizeResearch(filledGaps: Array<{ gap: string, resolution: string }>): string {
        if (filledGaps.length === 0) return ""

        let summary = "📊 Research Findings:\n\n"
        filledGaps.forEach((filled, index) => {
            summary += `${index + 1}. ${filled.gap}\n`
            summary += `   ✓ ${filled.resolution}\n\n`
        })

        return summary
    }

    // ... rest of existing methods (onContextCreated, performInitialAnalysis, etc.)

    private onContextCreated(context: Context, event: Event): void {
        this.log(`Planning session started for ${context.projectId}`);

        if (!context.planningData) {
            context.planningData = {
                currentScreen: 1,
                messages: [],
                confidence: 0,
                initialDescription: event.payload.description
            };
        }
    }

    private onWebSocketMessage(context: Context, event: Event): void {
        const { message } = event.payload;
        this.log(event)
        if (message.type === "user_message") {
            this.handleUserMessage(context, message.content);
        }
    }

    private async handleUserMessage(context: Context, userMessage: string): Promise<void> {
        this.log('message recived..., handling it')
        wsManager.sendMessage(context.projectId, { message: 'ok i will wait...' })
    }

    private async performInitialAnalysis(context: Context, event: Event): Promise<void> {
        this.log(`Starting initial analysis for ${context.projectId}`);

        const description = event.payload.description;
        wsManager.sendFiller(context.projectId, 'analyzing project...');

        try {
            // Step 1: Get analysis and gaps
            const analysis = await this.createInitialContext(description);
            this.log(analysis)

            // Step 2: Calculate confidence
            const { confidence, reasoning } = await this.calculateConfidence(
                description,
                analysis.gaps
            );
            this.log(confidence, reasoning)

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

            this.log(`Initial analysis complete: ${confidence}% confidence`);

            // Step 6: Check if we need to increase confidence
            if (confidence < 90) {
                this.log('Confidence is low, trying to increase confidence');
                await this.increaceConfidence(context, event);
            } else {
                this.log('Have enough confidence to move to the next step');
                // TODO: Move to next phase
            }

        } catch (error: any) {
            this.log(`Error in initial analysis: ${error.message}`);
            wsManager.sendMessage(context.projectId, {
                message: "I encountered an issue analyzing your project. Could you provide more details?"
            });
        }
    }

    private async createInitialContext(description: string): Promise<{
        gaps: string[];
        message: string;
    }> {
        try {
            const response = await llmService.chat({
                messages: [
                    {
                        role: "system",
                        content: PROMPTS.ANALYSIS_SYSTEM_PROMPT
                    },
                    {
                        role: "user",
                        content: description
                    }
                ],
                temperature: 0.7,
                max_tokens: 10000
            });

            if (!response.content) {
                throw new Error("Empty response from LLM");
            }

            const parsed = this.parseJSONResponse(response.content);

            if (!parsed.gaps || !Array.isArray(parsed.gaps)) {
                throw new Error("Invalid response format: missing gaps array");
            }
            if (!parsed.message || typeof parsed.message !== 'string') {
                throw new Error("Invalid response format: missing message");
            }

            return {
                gaps: parsed.gaps,
                message: parsed.message
            };

        } catch (error: any) {
            this.log(`Error in createInitialContext: ${error.message}`);
            return {
                gaps: ["Unable to analyze - please provide more details"],
                message: "I encountered an issue analyzing your description. Could you provide more details about your project?"
            };
        }
    }

    private async calculateConfidence(
        description: string,
        gaps: string[]
    ): Promise<{ confidence: number; reasoning: string }> {
        try {
            const response = await llmService.chat({
                messages: [
                    {
                        role: "system",
                        content: PROMPTS.CONFIDENCE_SYSTEM_PROMPT
                    },
                    {
                        role: "user",
                        content: JSON.stringify({
                            description,
                            identified_gaps: gaps
                        })
                    }
                ],
                temperature: 0.3,
                max_tokens: 10000
            });

            if (!response.content) {
                throw new Error("Empty response from LLM");
            }

            const parsed = this.parseJSONResponse(response.content);

            if (typeof parsed.confidence !== 'number') {
                throw new Error("Invalid response: confidence must be a number");
            }
            if (parsed.confidence < 0 || parsed.confidence > 100) {
                throw new Error("Invalid response: confidence must be between 0-100");
            }

            return {
                confidence: parsed.confidence,
                reasoning: parsed.reasoning || "No reasoning provided"
            };

        } catch (error: any) {
            this.log(`Error in calculateConfidence: ${error.message}`);
            return {
                confidence: 30,
                reasoning: "Unable to calculate confidence accurately"
            };
        }
    }

    private parseJSONResponse(content: string): any {
        try {
            const cleaned = content
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();

            return JSON.parse(cleaned);
        } catch (error) {
            this.log(`Failed to parse JSON: ${content}`);
            throw new Error('Invalid JSON response from LLM');
        }
    }

    private completeScreen(context: Context, screenNumber: number): void {
        this.log(`Screen ${screenNumber} complete for ${context.projectId}`);

        if (screenNumber < 3) {
            context.planningData!.currentScreen = (screenNumber + 1) as 1 | 2 | 3;
            context.planningData!.confidence = 0;
            context.planningData!.messages = [];

            wsManager.broadcast(context.projectId, {
                type: "screen_complete",
                timestamp: new Date().toISOString(),
                data: {
                    completedScreen: screenNumber,
                    nextScreen: screenNumber + 1,
                    artifacts: [
                        `/planning/screen-${screenNumber}-artifacts.md`
                    ]
                }
            });
        } else {
            this.completePlanning(context);
        }
    }

    private completePlanning(context: Context): void {
        this.log(`Planning complete for ${context.projectId}`);

        wsManager.broadcast(context.projectId, {
            type: "planning_complete",
            timestamp: new Date().toISOString(),
            data: {
                message: "All planning screens complete! Ready for implementation.",
                artifacts: context.artifacts
            }
        });
    }

    private onScreenComplete(context: Context, event: Event): void {
        const screenNumber = event.payload.screen;
        this.completeScreen(context, screenNumber);
    }
}