// src/llm/providers/nvidia.ts
import { LLMProvider, LLMRequest, LLMResponse, Message, ToolCall } from "../types";
import { logger } from "../../utils/logger";

/**
 * NVIDIA Provider for E.L.L.A
 * 
 * Configuration:
 * - Set NVIDIA_API_KEY in environment
 * - Set NVIDIA_MODEL (default: minimaxai/minimax-m2)
 * - Set LLM_PROVIDER=nvidia to use this provider
 * 
 * Example .env:
 * NVIDIA_API_KEY=your_nvidia_api_key_here
 * NVIDIA_MODEL=minimaxai/minimax-m2
 * LLM_PROVIDER=nvidia
 */

/**
 * NVIDIA API Provider for E.L.L.A
 * Uses NVIDIA's OpenAI-compatible API endpoint
 * 
 * Available models:
 * - minimaxai/minimax-m2 (MiniMax M2 - optimized for execution & automation)
 * - Other NVIDIA NIM models as they become available
 */
export class NvidiaProvider implements LLMProvider {
    name = "nvidia";
    private apiKey: string;
    private model: string;
    private baseUrl = "https://integrate.api.nvidia.com/v1";
    private includeReasoning: boolean;

    constructor() {
        this.apiKey = process.env.NVIDIA_API_KEY || "";
        // this.model = process.env.NVIDIA_MODEL || "minimaxai/minimax-m2";
        this.model = "openai/gpt-oss-120b";
        // this.model = "minimaxai/minimax-m2";
        // Option to include reasoning in logs (for debugging)
        this.includeReasoning = process.env.NVIDIA_INCLUDE_REASONING === "true";

        if (!this.apiKey) {
            throw new Error("NVIDIA_API_KEY not found in environment");
        }

        logger.info(`[NVIDIA] Initialized with model: ${this.model}`);
        if (this.includeReasoning) {
            logger.info(`[NVIDIA] Reasoning extraction enabled`);
        }
    }

    async chat(request: LLMRequest, model = null): Promise<LLMResponse> {
        try {
            const messages = this.convertMessages(request.messages);
            const tools = request.tools ? this.convertTools(request.tools) : undefined;

            const body: any = {
                model: model || this.model,
                messages,
            };

            // Add optional parameters
            if (request.temperature !== undefined) {
                body.temperature = request.temperature;
            }
            if (request.max_tokens !== undefined) {
                body.max_tokens = request.max_tokens;
            }

            // Add tools if provided
            if (tools && tools.length > 0) {
                body.tools = tools;
                body.tool_choice = request.tool_choice || "auto";
            }

            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`NVIDIA API error (${response.status}): ${error}`);
            }

            const data = await response.json();
            return this.parseResponse(data);

        } catch (error: any) {
            logger.error("[NVIDIA] Chat error:", error);
            throw error;
        }
    }

    private convertMessages(messages: Message[]): any[] {
        // NVIDIA API uses OpenAI-compatible format
        return messages.map(msg => {
            const converted: any = {
                role: msg.role,
                content: msg.content
            };

            // Add name if present
            if (msg.name) {
                converted.name = msg.name;
            }

            // Add tool_calls if present (assistant calling tools)
            if (msg.tool_calls) {
                converted.tool_calls = msg.tool_calls;
            }

            // Add tool_call_id if present (tool response)
            if (msg.tool_call_id) {
                converted.tool_call_id = msg.tool_call_id;
            }

            return converted;
        });
    }

    private convertTools(tools: any[]): any[] {
        // NVIDIA API uses OpenAI-compatible tool format
        logger.debug('tools', tools)
        return tools.map(tool => {
            return {
                type: "function",
                function: {
                    name: tool!.name || tool!.function!.name,
                    description: tool!.description || tool!.function!.description,
                    parameters: tool!.parameters || tool!.function?.parameters || tool!.parameter || tool!.function?.parameter
                }
            };
        });
    }

    private parseResponse(data: any): LLMResponse {
        const choice = data.choices?.[0];
        if (!choice) {
            throw new Error("No response from NVIDIA API");
        }

        const message = choice.message;
        let finishReason: LLMResponse["finish_reason"] = "stop";

        // Map finish_reason
        if (choice.finish_reason === "tool_calls") {
            finishReason = "tool_calls";
        } else if (choice.finish_reason === "length") {
            finishReason = "length";
        } else if (choice.finish_reason === "content_filter") {
            finishReason = "content_filter";
        }

        // Extract and clean content
        let content = message.content || null;
        let reasoning: string | null = null;

        if (content && content != "" && content.length > 0) {
            const extracted = this.extractReasoning(content);
            reasoning = extracted.reasoning;
            content = extracted.cleanContent || null;
        }

        // Use reasoning_content if provided by API (future support)
        if (message.reasoning_content) {
            reasoning = message.reasoning_content;
        }

        // Log reasoning for debugging/analysis
        if (reasoning && this.includeReasoning) {
            logger.debug(`[NVIDIA] 🧠 Reasoning (${data.usage?.reasoning_tokens || 0} tokens):`);
            logger.debug(reasoning.substring(0, 200) + (reasoning.length > 200 ? '...' : ''));
        }

        return {
            content: content,
            tool_calls: message.tool_calls || undefined,
            finish_reason: finishReason,
            usage: data.usage ? {
                prompt_tokens: data.usage.prompt_tokens || 0,
                completion_tokens: data.usage.completion_tokens || 0,
                total_tokens: data.usage.total_tokens || 0
            } : undefined
        };
    }

    /**
     * Get available models from NVIDIA
     */
    async getAvailableModels(): Promise<any[]> {
        try {
            const response = await fetch(`${this.baseUrl}/models`, {
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch models: ${response.statusText}`);
            }

            const data = await response.json();
            return data.data || [];
        } catch (error) {
            logger.error("[NVIDIA] Failed to fetch models:", error);
            return [];
        }
    }

    /**
     * Get model info
     */
    getModelInfo(): { name: string; provider: string } {
        return {
            name: this.model,
            provider: "nvidia"
        };
    }

    /**
     * Extract reasoning content from <think> tags
     * MiniMax M2 embeds chain-of-thought reasoning in <think> tags
     */
    private extractReasoning(content: string): {
        reasoning: string | null;
        cleanContent: string;
    } {
        logger.debug(content);
        const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
        const matches = content!.match(thinkRegex);

        let reasoning: string | null = null;
        let cleanContent = content;

        if (matches && matches.length > 0) {
            // Extract all reasoning blocks
            const reasoningParts: string[] = [];
            matches.forEach(match => {
                const innerMatch = match.match(/<think>([\s\S]*?)<\/think>/);
                if (innerMatch) {
                    reasoningParts.push(innerMatch[1].trim());
                }
            });

            reasoning = reasoningParts.join('\n\n');

            // Remove all <think> blocks from content
            cleanContent = content.replace(thinkRegex, '').trim();
        }

        return { reasoning, cleanContent };
    }
}