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
    | "force_next_screen"
    | "abort_planning"

    // Implementation stage
    | "story_complete"
    | "implementation_complete"

    // Review stage
    | "review_complete"

    // Testing stage
    | "tests_complete";

export interface Event {
    name: EventName;
    type: string;
    projectId: string;
    payload: Record<string, any>;
    timestamp: string;
}
