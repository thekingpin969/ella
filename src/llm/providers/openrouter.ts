// src/llm/providers/openrouter.ts
import { log } from "console";
import { LLMProvider, LLMRequest, LLMResponse, Message, ToolCall } from "../types";

/**
 * OpenRouter Provider for E.L.L.A
 * Supports all OpenRouter models with OpenAI-compatible API
 * 
 * Recommended models:
 * - anthropic/claude-3.5-sonnet (best reasoning)
 * - deepseek/deepseek-r1 (planning & architecture)
 * - qwen/qwen-2.5-coder-32b-instruct (code generation)
 * - google/gemini-2.0-flash-exp (fast & efficient)
 */

export class OpenRouterProvider implements LLMProvider {
    name = "openrouter";
    private apiKey: string;
    private model: string;
    private baseUrl = "https://openrouter.ai/api/v1";

    constructor() {
        this.apiKey = process.env.OPEN_ROUTER_API_KEY || "";
        this.model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-r1-0528:free";

        if (!this.apiKey) {
            throw new Error("OPEN_ROUTER_API_KEY not found in environment");
        }

        console.log(`[OpenRouter] Initialized with model: ${this.model}`);
    }

    async chat(request: LLMRequest): Promise<LLMResponse> {
        try {
            const messages = this.convertMessages(request.messages);
            const tools = request.tools ? this.convertTools(request.tools) : undefined;

            const body: any = {
                model: this.model,
                messages,
                temperature: request.temperature || 0.7,
                max_tokens: request.max_tokens || 8192,
                reasoning: {
                    enabled: true
                }
            };

            // Add tools if provided
            if (tools && tools.length > 0) {
                body.tools = tools;
                body.tool_choice = request.tool_choice || "auto";
            }

            const response = await fetch(
                `${this.baseUrl}/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${this.apiKey}`,
                        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
                        "X-Title": "E.L.L.A - Even Logic Loves Automation"
                    },
                    body: JSON.stringify(body)
                }
            );
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`OpenRouter API error (${response.status}): ${error}`);
            }

            const data = await response.json();
            log(data, data.choices)
            return this.parseResponse(data);

        } catch (error: any) {
            console.error("[OpenRouter] Chat error:", error);
            throw error;
        }
    }

    private convertMessages(messages: Message[]): any[] {
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
        // OpenRouter uses OpenAI-compatible tool format
        return tools.map(tool => ({
            type: "function",
            function: {
                name: tool.function.name,
                description: tool.function.description,
                parameters: tool.function.parameters
            }
        }));
    }

    private parseResponse(data: any): LLMResponse {
        const choice = data.choices?.[0];
        if (!choice) {
            throw new Error("No response from OpenRouter");
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

    /**
     * Get available models from OpenRouter
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
            console.error("[OpenRouter] Failed to fetch models:", error);
            return [];
        }
    }

    /**
     * Get model info
     */
    getModelInfo(): { name: string; provider: string } {
        return {
            name: this.model,
            provider: "openrouter"
        };
    }
}