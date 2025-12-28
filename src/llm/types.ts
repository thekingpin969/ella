// src/llm/types.ts

export type LLMProviders = "gemini" | "openrouter" | "deepseek" | "qwen" | "minimax";

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface Message {
    role: MessageRole;
    content: string;
    name?: string;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
}

export interface ToolCall {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string;
    };
}

export interface LLMRequest {
    messages: Message[];
    tools?: any[];
    tool_choice?: "auto" | "required" | "none";
    temperature?: number;
    max_tokens?: number;
}

export interface LLMResponse {
    content: string | null;
    tool_calls?: ToolCall[];
    finish_reason: "stop" | "tool_calls" | "length" | "content_filter";
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface LLMProvider {
    name: string;
    chat(request: LLMRequest): Promise<LLMResponse>;
}