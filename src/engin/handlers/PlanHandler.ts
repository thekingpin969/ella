import { BaseHandler } from "./BaseHandler";
import { Context } from "../types/context";
import { Event } from "../types/events";
import { wsManager } from "../../websocket/manager";

export class PlanHandler extends BaseHandler {

    handle(context: Context, event: Event): void {
        this.log(`Handling event: ${event.name}`);

        switch (event.name) {
            case "context_created":
                this.onContextCreated(context, event);
                break;

            case "client_connected":
                this.onClientConnected(context, event);
                break;

            case "websocket_message":
                this.onWebSocketMessage(context, event);
                break;

            case "screen_complete":
                this.onScreenComplete(context, event);
                break;
        }
    }

    /**
     * Project just created - initialize planning
     */
    private onContextCreated(context: Context, event: Event): void {
        this.log(`Planning session started for ${context.projectId}`);

        // Initialize planning data if not exists
        if (!context.planningData) {
            context.planningData = {
                currentScreen: 1,
                messages: [],
                confidence: 0,
                initialDescription: event.payload.description
            };
        }

        // WebSocket will be opened when user visits planning page
        // Nothing else to do here - wait for client_connected
    }

    /**
     * User opened planning page - send welcome message
     */
    private onClientConnected(context: Context, event: Event): void {
        const screen = context.planningData!.currentScreen;
        this.log(`Client connected for screen ${screen}`);

        // Send welcome message based on current screen
        this.sendWelcomeMessage(context, screen);
    }

    /**
     * User sent a message via WebSocket
     */
    private onWebSocketMessage(context: Context, event: Event): void {
        const message = event.payload;

        if (message.type === "user_message") {
            this.handleUserMessage(context, message.content);
        }
    }

    /**
     * Handle user message in chat
     */
    private async handleUserMessage(context: Context, userMessage: string): Promise<void> {
        // 1. Add to message history
        context.planningData!.messages.push({
            role: "user",
            content: userMessage,
            timestamp: new Date().toISOString()
        });

        // 2. Show typing indicator
        wsManager.broadcast(context.projectId, {
            type: "typing",
            timestamp: new Date().toISOString(),
            data: { isTyping: true }
        });

        // 3. TODO: Call LLM here to analyze and respond
        // For now, mock response
        const mockResponse = this.generateMockResponse(context, userMessage);

        // 4. Add assistant response to history
        context.planningData!.messages.push({
            role: "assistant",
            content: mockResponse.message,
            timestamp: new Date().toISOString()
        });

        // 5. Update confidence
        context.planningData!.confidence = mockResponse.confidence;

        // 6. Send response to client
        wsManager.broadcast(context.projectId, {
            type: "message",
            timestamp: new Date().toISOString(),
            data: {
                role: "assistant",
                content: mockResponse.message,
                confidence: mockResponse.confidence
            }
        });

        // 7. Check if screen complete
        if (mockResponse.confidence >= 90) {
            this.completeScreen(context, context.planningData!.currentScreen);
        }
    }

    /**
     * Send welcome message for a screen
     */
    private sendWelcomeMessage(context: Context, screen: number): void {
        let message = "";

        switch (screen) {
            case 1:
                message = `Hi! I'm E.L.L.A. Let's understand your project together.

I see you want to build: "${context.planningData!.initialDescription || "a new project"}"

To help me understand better, please share:
- What problem does this solve?
- Who will use this?
- Any specific features you have in mind?
- Design preferences?
- Technical constraints?

You can upload documents, paste links, or just chat with me!`;
                break;

            case 2:
                message = `Great work on understanding! Now let's define your UI/UX.

Based on your project, I'll help you:
- Choose a design mood
- Gather inspirations
- Create screen mockups
- Generate design tokens

What design style do you have in mind? (minimal, bold, playful, etc.)`;
                break;

            case 3:
                message = `Excellent! Now let's validate the technical side.

I'll help you:
- Verify API compatibility
- Check dependencies
- Identify potential risks
- Create integration checklist

What tech stack are you planning to use?`;
                break;
        }

        wsManager.broadcast(context.projectId, {
            type: "message",
            timestamp: new Date().toISOString(),
            data: {
                role: "assistant",
                content: message,
                confidence: context.planningData!.confidence
            }
        });
    }

    /**
     * Generate mock LLM response (replace with real LLM later)
     */
    private generateMockResponse(context: Context, userMessage: string): {
        message: string;
        confidence: number;
    } {
        const messageCount = context.planningData!.messages.length;
        const currentConfidence = context.planningData!.confidence;

        // Simulate confidence increase
        const newConfidence = Math.min(currentConfidence + 15, 100);

        // Mock response based on screen
        const screen = context.planningData!.currentScreen;
        let message = "";

        if (newConfidence < 90) {
            message = `Thanks for sharing! I'm getting clearer (${newConfidence}% confidence).

A few more questions to ensure I understand completely:
1. [Mock question based on screen ${screen}]
2. [Another clarifying question]

The more details you provide, the better I can help build this!`;
        } else {
            message = `Perfect! I now have a complete understanding (${newConfidence}% confidence).

Let me generate the artifacts for Screen ${screen}...

✅ All information gathered
✅ Ready to proceed

[Generating documents...]`;
        }

        return { message, confidence: newConfidence };
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

            // Send welcome message for next screen
            this.sendWelcomeMessage(context, context.planningData!.currentScreen);
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
