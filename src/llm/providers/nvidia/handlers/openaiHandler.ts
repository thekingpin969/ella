// src/llm/providers/nvidia/handlers/openaiHandler.ts
import { LLMRequest, LLMResponse, Message } from "../../../types";
import { ModelHandler, OpenAIChatRequest, OpenAIChatResponse, OpenAIMessage, OpenAITool } from "../types";

/**
 * OpenAI-compatible model handler
 * Used for models that follow the standard OpenAI API format
 * (e.g., openai/gpt-oss-120b on NVIDIA)
 */
export const openaiHandler: ModelHandler = {
    modelPattern: /openai|gpt/i,

    convertRequest(request: LLMRequest, model: string): OpenAIChatRequest {
        const body: OpenAIChatRequest = {
            model,
            messages: this.convertMessages(request.messages),
        };

        if (request.temperature !== undefined) {
            body.temperature = request.temperature;
        }
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
                content: msg.content
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
                parameters: tool?.parameters || tool?.function?.parameters || tool?.parameter || tool?.function?.parameter
            }
        }));
    },

    parseResponse(data: OpenAIChatResponse): LLMResponse {
        const choice = data.choices?.[0];
        if (!choice) {
            throw new Error("No response from API");
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
            usage: data.usage ? {
                prompt_tokens: data.usage.prompt_tokens || 0,
                completion_tokens: data.usage.completion_tokens || 0,
                total_tokens: data.usage.total_tokens || 0
            } : undefined
        };
    }
};
