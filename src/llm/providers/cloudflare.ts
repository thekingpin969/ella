// src/llm/providers/cloudflare.ts
import { LLMProvider, LLMRequest, LLMResponse, Message, ToolCall } from "../types";

/**
 * Cloudflare Workers AI Provider for E.L.L.A
 * Uses OpenAI-compatible endpoints
 * 
 * Recommended models for E.L.L.A:
 * - @cf/deepseek-ai/deepseek-r1-distill-qwen-32b (Planning/Reasoning)
 * - @cf/qwen/qwen2.5-coder-32b-instruct (Coding)
 * - @cf/meta/llama-3.3-70b-instruct-fp8-fast (Review/General)
 * - @cf/google/gemma-3-12b-it (Fast/Efficient)
 */
export class CloudflareProvider implements LLMProvider {
    name = "cloudflare";
    private apiKey: string;
    private accountId: string;
    private model: string;
    private baseUrl: string;

    constructor() {
        this.apiKey = process.env.CLOUDFLARE_API_KEY || "";
        this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
        this.model = process.env.CLOUDFLARE_MODEL || "@cf/qwen/qwen3-30b-a3b-fp8";

        if (!this.apiKey) {
            throw new Error("CLOUDFLARE_API_KEY not found in environment");
        }

        if (!this.accountId) {
            throw new Error("CLOUDFLARE_ACCOUNT_ID not found in environment");
        }

        this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/v1`;
        console.log(`[Cloudflare] Initialized with model: ${this.model}`);
    }

    async chat(request: LLMRequest): Promise<LLMResponse> {
        try {
            const messages = this.convertMessages(request.messages);
            const tools = request.tools ? this.convertTools(request.tools) : undefined;

            const body: any = {
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

            // Native Cloudflare endpoint: /ai/run/{model}
            const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`;

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Cloudflare API error (${response.status}): ${error}`);
            }

            const data = await response.json();
            console.log(data.result, data.result.choices?.[0])
            return this.parseResponse(data.result);

        } catch (error: any) {
            console.error("[Cloudflare] Chat error:", error);
            throw error;
        }
    }

    private convertMessages(messages: Message[]): any[] {
        // Cloudflare uses OpenAI-compatible format
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
        // Cloudflare uses OpenAI-compatible tool format
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
            throw new Error("No response from Cloudflare Workers AI");
        }

        const message = choice.message;
        let finishReason: LLMResponse["finish_reason"] = "stop";

        // Map finish_reason (OpenAI-compatible)
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
     * Get available models from Cloudflare Workers AI
     */
    async getAvailableModels(): Promise<any[]> {
        try {
            const response = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/models/search`,
                {
                    headers: {
                        "Authorization": `Bearer ${this.apiKey}`
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to fetch models: ${response.statusText}`);
            }

            const data = await response.json();
            return data.result || [];
        } catch (error) {
            console.error("[Cloudflare] Failed to fetch models:", error);
            return [];
        }
    }

    /**
     * Get embeddings (if using embedding model)
     */
    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        try {
            const embeddings: number[][] = [];

            for (const text of texts) {
                const response = await fetch(
                    `${this.baseUrl}/embeddings`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${this.apiKey}`
                        },
                        body: JSON.stringify({
                            model: "@cf/baai/bge-large-en-v1.5", // Default embedding model
                            input: text
                        })
                    }
                );

                if (!response.ok) {
                    throw new Error(`Embedding error: ${response.statusText}`);
                }

                const data = await response.json();
                if (data.data?.[0]?.embedding) {
                    embeddings.push(data.data[0].embedding);
                }
            }

            return embeddings;
        } catch (error) {
            console.error("[Cloudflare] Embedding error:", error);
            throw error;
        }
    }

    /**
     * Get model info
     */
    getModelInfo(): { name: string; provider: string } {
        return {
            name: this.model,
            provider: "cloudflare",
        };
    }
}

/**
 * Cloudflare-specific model recommendations for E.L.L.A agents
 */
export const CloudflareModels = {
    // Planning & Architecture
    PLANNER: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
    PLANNER_ALT: "@cf/qwen/qwq-32b",

    // Code Generation
    CODER: "@cf/qwen/qwen2.5-coder-32b-instruct",
    CODER_ALT: "@cf/meta/llama-3.1-8b-instruct",

    // Code Review
    REVIEWER: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    REVIEWER_ALT: "@cf/meta/llama-3.1-70b-instruct",

    // Execution & Testing
    EXECUTOR: "@cf/google/gemma-3-12b-it",
    EXECUTOR_ALT: "@cf/meta/llama-3.1-8b-instruct",

    // General Purpose
    GENERAL: "@cf/openai/gpt-oss-120b",
    GENERAL_FAST: "@cf/google/gemma-3-12b-it",

    // Embeddings
    EMBEDDING: "@cf/baai/bge-large-en-v1.5",
    EMBEDDING_MULTILINGUAL: "@cf/baai/bge-m3"
};