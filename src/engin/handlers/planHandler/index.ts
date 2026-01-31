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
import { updateProjectUnderstanding } from "./projectUnderstanding";
import { generatePRD } from "./prdGenerator";

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
            (ctx) => this.enrichProject(ctx, event)
        );
    }

    private onUserResponse(context: Context, event: Event): void {
        switch (event.type!) {
            case "answers_received":
                this.onAnswerReceived(context, event);
                break;
            case "websocket_message":
                this.onWebSocketMessage(context, event);
                break;
            case "user_message":
                // Content could be in payload.message.content or payload.content depending on source
                const content = event.payload.message?.content || event.payload.content || '';
                handleUserMessage(context, content);
                break;
            default:
                log(`Unknown event: ${event.type}`);
                break;
        }
    }

    private async onAnswerReceived(context: Context, event: Event): Promise<void> {
        await handleAnswersReceived(context, event, {
            incrementClarificationRound: (ctx) => incrementClarificationRound(ctx),
            getClarificationRound: (ctx) => getClarificationRound(ctx),
            completeScreen1: (ctx) => this.completeScreen1(ctx),
            handleMaxRoundsReached: (ctx, conf) => handleMaxRoundsReached(ctx, conf),
            increaseConfidence: (ctx, ev) => this.enrichProject(ctx, ev)
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
    // ENRICHMENT FLOW (replaces old confidence flow)
    // ==========================================

    /**
     * Enrich project understanding until ready for PRD
     * Event-driven: Process, ask questions, WAIT for user
     */
    private async enrichProject(context: Context, event: Event): Promise<void> {
        log('Enriching project understanding...');
        wsManager.sendLog(context.projectId, 'Enriching project understanding...');

        // Load current state from session memory
        const initialAnalysisStr = memoryService.getSession(context.projectId, 'initial_analysis');
        if (!initialAnalysisStr) {
            log('No initial analysis found');
            return;
        }

        const initialAnalysis = JSON.parse(initialAnalysisStr.content);
        const { description, gaps, confidence: currentConfidence } = initialAnalysis;
        wsManager.sendLog(context.projectId, `Current confidence: ${currentConfidence}%`, { gaps });

        // Step 1: Research fillable gaps
        wsManager.sendFiller(context.projectId, 'researching technical details...');
        const gapFillingResult = await conductGapFillingResearch(context, description, gaps);

        // Step 2: Update project understanding with research
        if (gapFillingResult.filledGaps.length > 0) {
            const researchSummary = summarizeResearch(gapFillingResult.filledGaps);
            await updateProjectUnderstanding(context, researchSummary, 'research');
            wsManager.sendMessage(context.projectId, { message: researchSummary });
        }

        // Step 3: Recalculate confidence
        wsManager.sendFiller(context.projectId, 'calculating confidence...');
        const updatedConfidence = await recalculateConfidence(
            context,
            description,
            gaps,
            gapFillingResult
        );

        log(`Confidence updated: ${currentConfidence}% → ${updatedConfidence.confidence}%`);

        // Step 4: Update session memory
        memoryService.setSession(context.projectId, 'initial_analysis', JSON.stringify({
            description,
            gaps: updatedConfidence.remainingGaps,
            filledGaps: gapFillingResult.filledGaps,
            confidence: updatedConfidence.confidence,
            reasoning: updatedConfidence.reasoning,
            timestamp: new Date().toISOString()
        }));

        context.planningData!.confidence = updatedConfidence.confidence;

        // Step 5: Check if ready for PRD
        if (updatedConfidence.confidence >= CONFIDENCE_THRESHOLD) {
            wsManager.sendMessage(context.projectId, {
                message: `✅ Confidence at ${updatedConfidence.confidence}%! Generating PRD...`
            });
            await generatePRD(context);
            await this.completeScreen1(context);
            return;
        }

        // Step 6: Ask user about remaining gaps
        wsManager.sendMessage(context.projectId, {
            message: `Confidence: ${updatedConfidence.confidence}%. I need your input on some decisions.`
        });

        // Ask and WAIT - no loops, just return after asking
        await askClarifyingQuestions(context, updatedConfidence.remainingGaps);

        // Function returns here - next call happens when user answers
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
