import { BaseHandler } from "./BaseHandler";
import { Context } from "../types/context";
import { Event } from "../types/events";
import { wsManager } from "../../websocket/manager";
import { sleep } from "bun";

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

    private async performInitialAnalysis(context: Context, event: Event): Promise<void> {
        this.log(`Starting initial analysis for ${context.projectId}`);

        const description = event.payload.description;
        wsManager.sendFiller(context.projectId, 'analysing project...')
        const analysis = await this.createInitialContext(description);
        context.planningData!.confidence = analysis.confidence;
        wsManager.sendMessage(context.projectId, { message: analysis.message })
        this.log(`Initial analysis complete: ${analysis.confidence}% confidence`);
        if (analysis.confidence < 95) {
            this.log('confidence is low, trying to increase confidence')
            this.increaceConfidence(context, event)
        } else {
            this.log('have enough confidence to move to the next step')
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

    private async createInitialContext(description: string): Promise<{ message: string; confidence: number; }> {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return {
            message: `Hi! I've analyzed your idea. A we app for "${description}" thats an excelent saas idea!, but the information you gave to my was insuffitiant, it may force me to guess, to avoid that please gave me more information through the clarifiying quetions i ask, here are they`,
            confidence: 20,
        };
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


    /**
     * Complete a planning screen
     */
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
