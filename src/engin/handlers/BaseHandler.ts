import { Context } from "../types/context";
import { Event } from "../types/events";

export abstract class BaseHandler {
    /**
     * Handle an event for this stage
     * Returns void - handlers work via WebSocket or internal state changes
     */
    abstract handle(context: Context, event: Event): void;

    /**
     * Log with handler prefix
     */
    protected log(...message: any): void {
        console.log(`[${this.constructor.name}] `, message);
    }
}
