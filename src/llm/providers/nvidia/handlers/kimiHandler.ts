// src/llm/providers/nvidia/handlers/kimiHandler.ts
import { LLMRequest, LLMResponse, Message } from "../../../types";
import { ModelHandler, OpenAIMessage, OpenAITool } from "../types";

/**
 * Kimi K2.5 model handler (moonshotai/kimi-k2.5)
 * 
 * Kimi K2.5 uses OpenAI-compatible format with additional features:
 * - Supports `chat_template_kwargs.thinking` for chain-of-thought reasoning
 * - Response includes `reasoning` / `reasoning_content` fields
 * - Uses `top_p` alongside `temperature`
 */

interface KimiChatRequest {
    model: string;
    messages: OpenAIMessage[];
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    stream: boolean;
    tools?: OpenAITool[];
    tool_choice?: "auto" | "required" | "none";
    chat_template_kwargs?: {
        thinking?: boolean;
    };
}

interface KimiChatResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: {
        index: number;
        message: {
            role: string;
            content: string | null;
            tool_calls?: {
                id: string;
                type: "function";
                function: {
                    name: string;
                    arguments: string;
                };
            }[];
            reasoning?: string;
            reasoning_content?: string;
        };
        finish_reason: string;
    }[];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export const kimiHandler: ModelHandler = {
    modelPattern: /kimi|moonshot/i,

    convertRequest(request: LLMRequest, model: string): KimiChatRequest {
        const body: KimiChatRequest = {
            model,
            messages: this.convertMessages(request.messages),
            temperature: request.temperature ?? 1.0,
            top_p: request.top_p ?? 1.0,
            stream: false,
            chat_template_kwargs: {
                thinking: true,
            },
        };

        if (request.max_tokens !== undefined) {
            body.max_tokens = request.max_tokens;
        }

        const tools = request.tools ? this.convertTools(request.tools) : undefined;
        if (tools && tools.length > 0) {
            body.tools = tools;
            body.tool_choice = request.tool_choice || "auto";
        }

        return body;
    },

    convertMessages(messages: Message[]): OpenAIMessage[] {
        return messages.map(msg => {
            const converted: OpenAIMessage = {
                role: msg.role,
                content: msg.content,
            };

            if (msg.name) {
                converted.name = msg.name;
            }
            if (msg.tool_calls) {
                converted.tool_calls = msg.tool_calls;
            }
            if (msg.tool_call_id) {
                converted.tool_call_id = msg.tool_call_id;
            }

            return converted;
        });
    },

    convertTools(tools: any[]): OpenAITool[] {
        return tools.map(tool => ({
            type: "function",
            function: {
                name: tool?.name || tool?.function?.name,
                description: tool?.description || tool?.function?.description,
                parameters: tool?.parameters || tool?.function?.parameters || tool?.parameter || tool?.function?.parameter,
            },
        }));
    },

    parseResponse(data: KimiChatResponse): LLMResponse {
        const choice = data.choices?.[0];
        if (!choice) {
            throw new Error("No response from Kimi API");
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

        return {
            content: message.content || null,
            tool_calls: message.tool_calls || undefined,
            finish_reason: finishReason,
            reasoning: message.reasoning_content || message.reasoning || undefined,
            usage: data.usage ? {
                prompt_tokens: data.usage.prompt_tokens || 0,
                completion_tokens: data.usage.completion_tokens || 0,
                total_tokens: data.usage.total_tokens || 0,
            } : undefined,
        };
    },
};
