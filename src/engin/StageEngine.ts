import { Context } from "./types/context";
import { Event, EventName } from "./types/events";
import { Stage } from "./types/stages";
import { BaseHandler } from "./handlers/BaseHandler";
import { PlanHandler } from "./handlers/PlanHandler";
import { ImplementationHandler } from "./handlers/ImplementationHandler";
import { ReviewHandler } from "./handlers/ReviewHandler";
import { ExecutorHandler } from "./handlers/ExecutorHandler";

export class StageEngine {
    // In-memory context storage
    private contexts: Map<string, Context> = new Map();

    // Handler registry
    private handlers: Map<Stage, BaseHandler> = new Map();

    constructor() {
        // Register handlers for each stage
        this.handlers.set(Stage.PLANNING, new PlanHandler());
        this.handlers.set(Stage.IMPLEMENTATION, new ImplementationHandler());
        this.handlers.set(Stage.REVIEW, new ReviewHandler());
        this.handlers.set(Stage.TESTING, new ExecutorHandler());

        console.log("[StageEngine] Initialized with handlers:", Array.from(this.handlers.keys()));
    }

    /**
     * Create context for a new project
     */
    createContext(
        projectId: string,
        projectName: string,
        driveFolderId: string,
        initialDescription?: string
    ): Context {
        const context: Context = {
            projectId,
            projectName,
            stage: Stage.PLANNING,
            driveFolderId,
            planningData: {
                currentScreen: 1,
                messages: [],
                confidence: 0,
                initialDescription
            },
            artifacts: []
        };

        this.contexts.set(projectId, context);

        console.log(`[StageEngine] Context created for ${projectId}`);

        return context;
    }

    /**
     * Get context for a project
     */
    getContext(projectId: string): Context | undefined {
        return this.contexts.get(projectId);
    }

    /**
     * Emit an event to the stage engine
     */
    emitEvent(event: Partial<Event>): void {
        // Build full event
        const fullEvent: Event = {
            name: event.name!,
            projectId: event.projectId!,
            payload: event.payload || {},
            timestamp: event.timestamp || new Date().toISOString()
        };

        console.log(`[StageEngine] Event received: ${fullEvent.name} for ${fullEvent.projectId}`);

        // Get context
        const context = this.contexts.get(fullEvent.projectId);
        if (!context) {
            console.error(`[StageEngine] Context not found: ${fullEvent.projectId}`);
            return;
        }

        // Get handler for current stage
        const handler = this.handlers.get(context.stage);
        if (!handler) {
            console.error(`[StageEngine] No handler for stage: ${context.stage}`);
            return;
        }

        // Call handler
        handler.handle(context, fullEvent);

        // Check for stage transitions
        this.checkStageTransition(context, fullEvent);
    }

    /**
     * Check if stage should transition
     */
    private checkStageTransition(context: Context, event: Event): void {
        let shouldTransition = false;
        let newStage: Stage | null = null;

        // Define transition rules
        if (context.stage === Stage.PLANNING && event.name === "planning_complete") {
            shouldTransition = true;
            newStage = Stage.IMPLEMENTATION;
        } else if (context.stage === Stage.IMPLEMENTATION && event.name === "implementation_complete") {
            shouldTransition = true;
            newStage = Stage.REVIEW;
        } else if (context.stage === Stage.REVIEW && event.name === "review_complete") {
            shouldTransition = true;
            newStage = Stage.TESTING;
        } else if (context.stage === Stage.TESTING && event.name === "tests_complete") {
            shouldTransition = true;
            newStage = Stage.COMPLETE;
        }

        // Perform transition
        if (shouldTransition && newStage) {
            this.transitionStage(context, newStage);
        }
    }

    /**
     * Transition to a new stage
     */
    private transitionStage(context: Context, newStage: Stage): void {
        const oldStage = context.stage;
        context.stage = newStage;

        console.log(`[StageEngine] Stage transition: ${oldStage} → ${newStage} for ${context.projectId}`);

        // Emit event to new stage handler
        this.emitEvent({
            name: `${oldStage}_complete` as EventName,
            projectId: context.projectId,
            payload: { from: oldStage, to: newStage }
        });
    }

    /**
     * Get all contexts (for debugging)
     */
    getAllContexts(): Context[] {
        return Array.from(this.contexts.values());
    }
}
