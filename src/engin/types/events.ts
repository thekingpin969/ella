export type EventName =
    // Project lifecycle
    | "context_created"
    | "client_connected"
    | "client_disconnected"

    // WebSocket messages
    | "websocket_message"

    // Planning stage
    | "screen_complete"
    | "answers_received"
    | "start_initial_analysis"
    | "planning_complete"
    | "user_response"

    // Implementation stage
    | "story_complete"
    | "implementation_complete"

    // Review stage
    | "review_complete"

    // Testing stage
    | "tests_complete";

export interface Event {
    name: EventName;
    projectId: string;
    payload: Record<string, any>;
    timestamp: string;
}
