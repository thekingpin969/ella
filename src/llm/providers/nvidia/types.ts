// src/llm/providers/nvidia/types.ts
import { LLMRequest, LLMResponse, Message, ToolCall } from "../../types";

/**
 * Model Handler Interface
 * Each model type implements this to handle request/response transformations
 */
export interface ModelHandler {
    /** Model identifier pattern (used for matching) */
    modelPattern: RegExp;

    /** Convert uniform LLMRequest to model-specific API request */
    convertRequest(request: LLMRequest, model: string): any;

    /** Convert model-specific messages to API format */
    convertMessages(messages: Message[]): any[];

    /** Convert tools to model-specific format */
    convertTools(tools: any[]): any[];

    /** Parse model-specific API response to uniform LLMResponse */
    parseResponse(data: any): LLMResponse;
}

// ============================================
// Common Types (OpenAI-compatible base format)
// ============================================

export interface OpenAIMessage {
    role: string;
    content: string;
    name?: string;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
}

export interface OpenAITool {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: any;
    };
}

export interface OpenAIChatRequest {
    model: string;
    messages: OpenAIMessage[];
    temperature?: number;
    max_tokens?: number;
    tools?: OpenAITool[];
    tool_choice?: "auto" | "required" | "none";
}

export interface OpenAIChatResponse {
    choices: {
        message: {
            content: string | null;
            tool_calls?: ToolCall[];
            reasoning_content?: string;
        };
        finish_reason: string;
    }[];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        reasoning_tokens?: number;
    };
}

// ============================================
// MiniMax-specific Types
// TODO: Fill in actual MiniMax schema when provided
// ============================================

export interface MinimaxBotSetting {
    bot_name: string;
    content: string;
}

export interface MinimaxReplyConstraints {
    sender_type: string;
    sender_name: string;
}

export interface MinimaxMessage {
    sender_type: "USER" | "BOT";
    sender_name?: string;
    text: string;
}

export interface MinimaxChatRequest {
    model: string;
    messages: MinimaxMessage[];
    temperature?: number;
    tokens_to_generate?: number;
    bot_setting?: MinimaxBotSetting[];
    reply_constraints?: MinimaxReplyConstraints;
    tools?: any[];
    tool_choice?: string;
}

export interface MinimaxChatResponse {
    choices: {
        messages: {
            sender_type: string;
            sender_name: string;
            text: string;
            function_call?: {
                name: string;
                arguments: string;
            };
        }[];
        finish_reason: string;
    }[];
    usage?: {
        total_tokens: number;
    };
    base_resp?: {
        status_code: number;
        status_msg: string;
    };
}

// ============================================
// GLM-specific Types
// TODO: Fill in actual GLM schema when provided
// ============================================

export interface GlmMessage {
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    tool_calls?: any[];
    tool_call_id?: string;
}

export interface GlmChatRequest {
    model: string;
    messages: GlmMessage[];
    temperature?: number;
    max_tokens?: number;
    tools?: any[];
    tool_choice?: string;
    // GLM-specific fields can be added here
    do_sample?: boolean;
    top_p?: number;
}

export interface GlmChatResponse {
    choices: {
        message: {
            role: string;
            content: string | null;
            tool_calls?: {
                id: string;
                type: string;
                function: {
                    name: string;
                    arguments: string;
                };
            }[];
        };
        finish_reason: string;
    }[];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}
