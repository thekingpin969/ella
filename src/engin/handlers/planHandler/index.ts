// planHandler/index.ts
// Main PlanHandler class - orchestrates all modules

import { BaseHandler } from "../BaseHandler";
import { Context } from "../../types/context";
import { Event } from "../../types/events";
import { wsManager } from "../../../websocket/manager";
import { memoryService } from "../../../memory";

// Import modules
import { CONFIDENCE_THRESHOLD } from "./types";
import { log } from "./utils";
import { performInitialAnalysis } from "./analysis";
import { conductGapFillingResearch, recalculateConfidence, summarizeResearch } from "./gapFilling";
import { handleAnswersReceived } from "./answers";
import { completeScreen1 } from "./artifacts";
import {
    incrementClarificationRound,
    getClarificationRound,
    askClarifyingQuestions,
    handleMaxRoundsReached
} from "./clarification";
import { handleUserOverride, handleAbort, handleUserMessage } from "./edgeCases";

export class PlanHandler extends BaseHandler {

    handle(context: Context, event: Event): void {
        log(`Handling event: ${event.name}`);
        wsManager.sendLog(context.projectId, `Handling event: ${event.name}`, { event });

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
            case "answers_received":
                this.onAnswerReceived(context, event);
                break;
            case "screen_complete":
                this.onScreenComplete(context, event);
                break;
            case "force_next_screen":
                this.handleUserOverride(context, event);
                break;
            case "abort_planning":
                this.handleAbort(context);
                break;
        }
    }

    // ==========================================
    // EVENT HANDLERS
    // ==========================================

    private onContextCreated(context: Context, event: Event): void {
        log(`Planning session started for ${context.projectId}`);

        if (!context.planningData) {
            context.planningData = {
                currentScreen: 1,
                messages: [],
                confidence: 0,
                initialDescription: event.payload.description
            };
        }
    }

    private async performInitialAnalysis(context: Context, event: Event): Promise<void> {
        await performInitialAnalysis(
            context,
            event.payload.description,
            (ctx) => this.increaseConfidence(ctx, event)
        );
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
                log(`Unknown event: ${event.name}`);
                break;
        }
    }

    private async onAnswerReceived(context: Context, event: Event): Promise<void> {
        await handleAnswersReceived(context, event, {
            incrementClarificationRound: (ctx) => incrementClarificationRound(ctx),
            getClarificationRound: (ctx) => getClarificationRound(ctx),
            completeScreen1: (ctx) => this.completeScreen1(ctx),
            handleMaxRoundsReached: (ctx, conf) => handleMaxRoundsReached(ctx, conf),
            increaseConfidence: (ctx, ev) => this.increaseConfidence(ctx, ev)
        });
    }

    private onWebSocketMessage(context: Context, event: Event): void {
        const { message } = event.payload;
        log(event);
        if (message.type === "user_message") {
            handleUserMessage(context, message.content);
        }
    }

    private onScreenComplete(context: Context, event: Event): void {
        const screenNumber = event.payload.screen;
        this.completeScreen(context, screenNumber);
    }

    // ==========================================
    // CONFIDENCE FLOW
    // ==========================================

    private async increaseConfidence(context: Context, event: Event): Promise<void> {
        log('Starting autonomous gap-filling process...');
        wsManager.sendLog(context.projectId, 'Starting autonomous gap-filling process...');

        // Load current state from session memory
        const initialAnalysisStr = memoryService.getSession(context.projectId, 'initial_analysis');
        if (!initialAnalysisStr) {
            log('No initial analysis found');
            return;
        }

        const initialAnalysis = JSON.parse(initialAnalysisStr.content);
        const { description, gaps, confidence: currentConfidence } = initialAnalysis;
        wsManager.sendLog(context.projectId, `Loaded initial analysis. Current confidence: ${currentConfidence}%`, { gaps });

        // Ask E.L.L.A to research and fill gaps autonomously
        wsManager.sendFiller(context.projectId, 'analyzing gaps and conducting research...');

        const gapFillingResult = await conductGapFillingResearch(context, description, gaps);

        // Recalculate confidence with filled gaps
        wsManager.sendFiller(context.projectId, 'updating confidence with research findings...');

        const updatedConfidence = await recalculateConfidence(
            context,
            description,
            gaps,
            gapFillingResult
        );

        log(`Confidence updated: ${currentConfidence}% → ${updatedConfidence.confidence}%`);

        // Update session memory
        memoryService.setSession(context.projectId, 'initial_analysis', JSON.stringify({
            description,
            gaps: updatedConfidence.remainingGaps,
            filledGaps: gapFillingResult.filledGaps,
            confidence: updatedConfidence.confidence,
            reasoning: updatedConfidence.reasoning,
            timestamp: new Date().toISOString()
        }));

        log('passed')
        // Check if we still need user input
        if (updatedConfidence.confidence >= CONFIDENCE_THRESHOLD - 5) { // 90% threshold for research
            wsManager.sendMessage(context.projectId, {
                message: `✅ Research complete! Confidence now at ${updatedConfidence.confidence}%. Ready to proceed.`
            });

            // Show what was researched
            if (gapFillingResult.filledGaps.length > 0) {
                const summary = summarizeResearch(gapFillingResult.filledGaps);
                wsManager.sendMessage(context.projectId, { message: summary });
            }

            if (updatedConfidence.confidence >= CONFIDENCE_THRESHOLD) {
                await this.completeScreen1(context);
            }
        } else {
            // Still need user input for business decisions
            wsManager.sendMessage(context.projectId, {
                message: `I've researched technical details (confidence: ${updatedConfidence.confidence}%), but I need your input on some business decisions.`
            });

            await askClarifyingQuestions(context, updatedConfidence.remainingGaps);
        }
    }

    // ==========================================
    // SCREEN COMPLETION
    // ==========================================

    private async completeScreen1(context: Context): Promise<void> {
        await completeScreen1(context, (ctx, num) => this.completeScreen(ctx, num));
    }

    private completeScreen(context: Context, screenNumber: number): void {
        log(`Screen ${screenNumber} complete for ${context.projectId}`);

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
                    artifacts: context.artifacts
                }
            });
        } else {
            this.completePlanning(context);
        }
    }

    private completePlanning(context: Context): void {
        log(`Planning complete for ${context.projectId}`);

        wsManager.broadcast(context.projectId, {
            type: "planning_complete",
            timestamp: new Date().toISOString(),
            data: {
                message: "All planning screens complete! Ready for implementation.",
                artifacts: context.artifacts
            }
        });
    }

    // ==========================================
    // EDGE CASES
    // ==========================================

    private async handleUserOverride(context: Context, event: Event): Promise<void> {
        await handleUserOverride(context, event, (ctx) => this.completeScreen1(ctx));
    }

    private async handleAbort(context: Context): Promise<void> {
        await handleAbort(context);
    }
}
