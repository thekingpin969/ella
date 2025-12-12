import { BaseHandler } from "./BaseHandler";
import { Context } from "../types/context";
import { Event } from "../types/events";

export class ReviewHandler extends BaseHandler {

    handle(context: Context, event: Event): void {
        this.log(`Handling event: ${event.name}`);

        switch (event.name) {
            case "implementation_complete":
                this.onImplementationComplete(context);
                break;
        }
    }

    private onImplementationComplete(context: Context): void {
        this.log(`Review started for ${context.projectId}`);

        // TODO: Review generated code

        this.log("Review logic will be added here");
    }
}
