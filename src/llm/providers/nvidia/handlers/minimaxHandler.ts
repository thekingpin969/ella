// src/llm/providers/nvidia/handlers/minimaxHandler.ts
import { LLMRequest, LLMResponse, Message } from "../../../types";
import { ModelHandler } from "../types";
import { logger } from "../../../../utils/logger";

/**
 * MiniMax request format
 */
interface MinimaxChatRequest {
    model: string;
    messages: MinimaxMessage[];
    temperature?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    max_tokens?: number;
    stream?: boolean;
    tools?: any[];
    tool_choice?: string;
}

interface MinimaxMessage {
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    tool_calls?: any[];
    tool_call_id?: string;
}

interface MinimaxChatResponse {
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
 * Extract reasoning content from <think> tags
 * MiniMax embeds chain-of-thought reasoning in <think> tags within content
 */
function extractReasoning(content: string): {
    reasoning: string | null;
    cleanContent: string;
} {
    const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
    const matches = content.match(thinkRegex);

    let reasoning: string | null = null;
    let cleanContent = content;

    if (matches && matches.length > 0) {
        const reasoningParts: string[] = [];
        matches.forEach(match => {
            const innerMatch = match.match(/<think>([\s\S]*?)<\/think>/);
            if (innerMatch) {
                reasoningParts.push(innerMatch[1].trim());
            }
        });

        reasoning = reasoningParts.join('\n\n');
        cleanContent = content.replace(thinkRegex, '').trim();
    }

    return { reasoning, cleanContent };
}

/**
 * MiniMax model handler
 * Handles MiniMax-specific request/response transformations
 * 
 * MiniMax models embed reasoning in <think> tags within the content field
 */
export const minimaxHandler: ModelHandler = {
    modelPattern: /minimax/i,

    convertRequest(request: LLMRequest, model: string): MinimaxChatRequest {
        const body: MinimaxChatRequest = {
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

        // MiniMax-specific defaults
        body.top_p = 0.95;
        body.frequency_penalty = 0;
        body.presence_penalty = 0;

        const tools = request.tools ? this.convertTools(request.tools) : undefined;
        if (tools && tools.length > 0) {
            body.tools = tools;
            body.tool_choice = request.tool_choice || "auto";
        }

        return body;
    },

    convertMessages(messages: Message[]): MinimaxMessage[] {
        return messages.map(msg => {
            const converted: MinimaxMessage = {
                role: msg.role as MinimaxMessage["role"],
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

    parseResponse(data: MinimaxChatResponse): LLMResponse {
        const choice = data.choices?.[0];
        if (!choice) {
            throw new Error("No response from MiniMax API");
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

        // Extract reasoning from <think> tags in content
        let content = message.content || null;
        let reasoning: string | null = null;

        if (content && content.length > 0) {
            const extracted = extractReasoning(content);
            reasoning = extracted.reasoning;
            content = extracted.cleanContent || null;
        }

        // Log reasoning if present
        if (reasoning) {
            logger.debug(`[MiniMax] 🧠 Reasoning extracted (${reasoning.length} chars)`);
            logger.debug(`[MiniMax] Reasoning: ${reasoning.substring(0, 200)}...`);
        }

        // Convert tool_calls format
        const toolCalls = message.tool_calls?.map(tc => ({
            id: tc.id,
            type: tc.type as "function",
            function: {
                name: tc.function.name,
                arguments: tc.function.arguments
            }
        }));

        return {
            content: content,
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
