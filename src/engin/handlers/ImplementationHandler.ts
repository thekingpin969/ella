import { BaseHandler } from "./BaseHandler";
import { Context } from "../types/context";
import { Event } from "../types/events";

export class ImplementationHandler extends BaseHandler {

    handle(context: Context, event: Event): void {
        this.log(`Handling event: ${event.name}`);

        switch (event.name) {
            case "planning_complete":
                this.onPlanningComplete(context);
                break;

            case "story_complete":
                this.onStoryComplete(context, event);
                break;
        }
    }

    private onPlanningComplete(context: Context): void {
        this.log(`Implementation started for ${context.projectId}`);

        // TODO: 
        // 1. Load PRD and Architecture from planning
        // 2. Break into stories
        // 3. Start implementing first story

        this.log("Implementation logic will be added here");
    }

    private onStoryComplete(context: Context, event: Event): void {
        const storyId = event.payload.storyId;
        this.log(`Story complete: ${storyId}`);

        // TODO: Move to next story or complete implementation
    }
}
