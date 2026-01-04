import { BaseHandler } from "./BaseHandler";
import { Context } from "../types/context";
import { Event } from "../types/events";
import { wsManager } from "../../websocket/manager";
import { sleep } from "bun";
import { llmService } from "../../llm";
import { memoryService } from "../../memory";
import { PROMPTS } from "../prompts/prompts";

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

    // private async performInitialAnalysis(context: Context, event: Event): Promise<void> {
    //     this.log(`Starting initial analysis for ${context.projectId}`);

    //     const description = event.payload.description;
    //     wsManager.sendFiller(context.projectId, 'analysing project...')
    //     const analysis = await this.createInitialContext(description);
    //     context.planningData!.confidence = analysis.confidence;
    //     wsManager.sendMessage(context.projectId, { message: analysis.message })
    //     this.log(`Initial analysis complete: ${analysis.confidence}% confidence`);
    //     if (analysis.confidence < 95) {
    //         this.log('confidence is low, trying to increase confidence')
    //         this.increaceConfidence(context, event)
    //     } else {
    //         this.log('have enough confidence to move to the next step')
    //     }
    // }

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
            this.increaceConfidence(context, event)
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

    private async increaceConfidence(context: Context, event: Event): Promise<void> {
        this.log('analysing context to increase confidence...')
        wsManager.sendFiller(context.projectId, 'finding gaps...')
        await sleep(1000 * 10)
        wsManager.sendFiller(context.projectId, 'trying to fill gaps...')
        await sleep(1000 * 10)
        wsManager.sendFiller(context.projectId, 'reserching on topics to fill gaps...')
        await sleep(1000 * 10)
        wsManager.sendFiller(context.projectId, 'finalysing reserch...')
        await sleep(1000 * 10)
        wsManager.sendFiller(context.projectId, 'need more clarity, preparing questions...')
        await sleep(1000 * 10)
        wsManager.sendMessage(context.projectId, { message: 'i have done my own research and still i need clarification from your side to fill out the gaps' })
        wsManager.sendFiller(context.projectId, 'need more clarity, preparing questions...')
        await sleep(1000 * 10)

        this.log('increasing confidence through clarifying questions...')
        this.log('genarating questions...')
    }

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

    /**
     * User sent a message via WebSocket
     */
    private onWebSocketMessage(context: Context, event: Event): void {
        const { message } = event.payload;
        this.log(event)
        if (message.type === "user_message") {
            this.handleUserMessage(context, message.content);
        }
    }

    /**
     * Handle user message in chat
     */
    private async handleUserMessage(context: Context, userMessage: string): Promise<void> {
        this.log('message recived..., handling it')
        wsManager.sendMessage(context.projectId, { message: 'ok i will wait...' })



    }

    private async performInitialAnalysis(context: Context, event: Event): Promise<void> {
        this.log(`Starting initial analysis for ${context.projectId}`);

        const description = event.payload.description;
        // this.log(description)
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

            // if (!response) {
            if (!response.content) {
                throw new Error("Empty response from LLM");
            }

            // const parsed = this.parseJSONResponse(response);
            const parsed = this.parseJSONResponse(response.content);

            // Validate response structure
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
            // Fallback response
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
                temperature: 0.3, // Lower for consistency
                max_tokens: 10000
            });

            // if (!response) {
            if (!response.content) {
                throw new Error("Empty response from LLM");
            }

            // const parsed = this.parseJSONResponse(response);
            const parsed = this.parseJSONResponse(response.content);

            // Validate response
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
            // Fallback to conservative confidence
            return {
                confidence: 30,
                reasoning: "Unable to calculate confidence accurately"
            };
        }
    }


    private parseJSONResponse(content: string): any {
        try {
            // Remove markdown code fences if present
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

        // TODO: Generate artifacts here
        // For now, just notify

        if (screenNumber < 3) {
            // Move to next screen
            context.planningData!.currentScreen = (screenNumber + 1) as 1 | 2 | 3;
            context.planningData!.confidence = 0; // Reset for next screen
            context.planningData!.messages = []; // Clear chat for next screen

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
            // All screens complete - planning done!
            this.completePlanning(context);
        }
    }

    /**
     * All planning screens complete
     */
    private completePlanning(context: Context): void {
        this.log(`Planning complete for ${context.projectId}`);

        // Notify client
        wsManager.broadcast(context.projectId, {
            type: "planning_complete",
            timestamp: new Date().toISOString(),
            data: {
                message: "All planning screens complete! Ready for implementation.",
                artifacts: context.artifacts
            }
        });

        // Transition to implementation stage
        // This will be handled by StageEngine when it receives planning_complete event
    }

    /**
     * Screen manually completed by user
     */
    private onScreenComplete(context: Context, event: Event): void {
        const screenNumber = event.payload.screen;
        this.completeScreen(context, screenNumber);
    }
}
