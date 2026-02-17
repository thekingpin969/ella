export type EventName =
    // Project lifecycle
    | "context_created"
    | "client_connected"
    | "client_disconnected"

    // WebSocket messages
    | "websocket_message"

    // Planning stage - Screen 1
    | "screen_complete"
    | "answers_received"
    | "start_initial_analysis"
    | "planning_complete"
    | "user_response"
    | "force_next_screen"
    | "abort_planning"

    // Planning stage - Screen 2 (UI/UX)
    | "start_uiux_design"
    | "mood_selected"
    | "inspirations_rated"
    | "screen_feedback"
    | "variant_chat"
    | "refine_components"
    | "complete_screen2"

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
