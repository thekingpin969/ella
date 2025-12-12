import { BaseHandler } from "./BaseHandler";
import { Context } from "../types/context";
import { Event } from "../types/events";

export class ExecutorHandler extends BaseHandler {

    handle(context: Context, event: Event): void {
        this.log(`Handling event: ${event.name}`);

        switch (event.name) {
            case "review_complete":
                this.onReviewComplete(context);
                break;
        }
    }

    private onReviewComplete(context: Context): void {
        this.log(`Testing started for ${context.projectId}`);

        // TODO: Run tests

        this.log("Testing logic will be added here");
    }
}
