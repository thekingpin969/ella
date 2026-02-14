// src/llm/providers/nvidia/handlers/glmHandler.ts
import { LLMRequest, LLMResponse, Message } from "../../../types";
import { ModelHandler } from "../types";
import { logger } from "../../../../utils/logger";

/**
 * GLM request format specific fields
 */
interface GlmChatRequest {
    model: string;
    messages: GlmMessage[];
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    seed?: number;
    stream?: boolean;
    chat_template_kwargs?: {
        enable_thinking?: boolean;
        clear_thinking?: boolean;
    };
    tools?: any[];
    tool_choice?: string;
}

interface GlmMessage {
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    tool_calls?: any[];
    tool_call_id?: string;
}

interface GlmChatResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: {
        index: number;
        message: {
            role: string;
            content: string | null;
            reasoning_content?: string | null;
            tool_calls?: {
                id: string;
                type: string;
                function: {
                    name: string;
                    arguments: string;
                };
            }[] | null;
        };
        logprobs: any | null;
        finish_reason: string;
        matched_stop?: number;
    }[];
    usage?: {
        prompt_tokens: number;
        total_tokens: number;
        completion_tokens: number;
        prompt_tokens_details?: any;
        reasoning_tokens?: number;
    };
    metadata?: {
        weight_version: string;
    };
}

/**
 * GLM model handler
 * Handles GLM-specific request/response transformations
 * 
 * GLM models support:
 * - enable_thinking: Returns reasoning in reasoning_content field
 * - clear_thinking: Whether to clear thinking from the response
 */
export const glmHandler: ModelHandler = {
    modelPattern: /glm/i,

    convertRequest(request: LLMRequest, model: string): GlmChatRequest {
        const body: GlmChatRequest = {
            model,
            messages: this.convertMessages(request.messages),
            stream: false, // Default to non-streaming
        };

        if (request.temperature !== undefined) {
            body.temperature = request.temperature;
        }
        if (request.max_tokens !== undefined) {
            // body.max_tokens = request.max_tokens;
            body.max_tokens = 100000;
        }

        // GLM-specific: Enable thinking/reasoning by default
        body.top_p = 1;
        body.chat_template_kwargs = {
            enable_thinking: true,
            clear_thinking: true  // Clear thinking from main content, keep in reasoning_content
        };

        const tools = request.tools ? this.convertTools(request.tools) : undefined;
        if (tools && tools.length > 0) {
            body.tools = tools;
            body.tool_choice = request.tool_choice || "auto";
        }

        return body;
    },

    convertMessages(messages: Message[]): GlmMessage[] {
        return messages.map(msg => {
            const converted: GlmMessage = {
                role: msg.role as GlmMessage["role"],
                content: msg.content
            };

            if (msg.tool_calls) {
                converted.tool_calls = msg.tool_calls;
            }
            if (msg.tool_call_id) {
                converted.tool_call_id = msg.tool_call_id;
            }

            return converted;
        });
    },

    convertTools(tools: any[]): any[] {
        return tools.map(tool => ({
            type: "function",
            function: {
                name: tool?.name || tool?.function?.name,
                description: tool?.description || tool?.function?.description,
                parameters: tool?.parameters || tool?.function?.parameters || tool?.parameter || tool?.function?.parameter
            }
        }));
    },

    parseResponse(data: GlmChatResponse): LLMResponse {
        const choice = data.choices?.[0];
        if (!choice) {
            throw new Error("No response from GLM API");
        }

        const message = choice.message;
        let finishReason: LLMResponse["finish_reason"] = "stop";

        if (choice.finish_reason === "tool_calls") {
            finishReason = "tool_calls";
        } else if (choice.finish_reason === "length") {
            finishReason = "length";
        } else if (choice.finish_reason === "content_filter") {
            finishReason = "content_filter";
        }

        // Log reasoning content if present
        if (message.reasoning_content) {
            logger.debug(`[GLM] 🧠 Reasoning: ${message.reasoning_content.substring(0, 200)}...`);
        }

        // Convert GLM tool_calls format to standard format
        const toolCalls = message.tool_calls?.map(tc => ({
            id: tc.id,
            type: tc.type as "function",
            function: {
                name: tc.function.name,
                arguments: tc.function.arguments
            }
        }));

        return {
            content: message.content || null,
            tool_calls: toolCalls || undefined,
            finish_reason: finishReason,
            usage: data.usage ? {
                prompt_tokens: data.usage.prompt_tokens || 0,
                completion_tokens: data.usage.completion_tokens || 0,
                total_tokens: data.usage.total_tokens || 0
            } : undefined
        };
    }
};
