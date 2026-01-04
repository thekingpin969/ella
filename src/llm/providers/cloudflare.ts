import { log } from "console";
import { LLMProvider, LLMRequest, LLMResponse, Message, ToolCall } from "../types";

export class CloudflareProvider implements LLMProvider {
    name = "cloudflare";
    private apiKey: string;
    private accountId: string;
    private model: string;
    private baseUrl: string;

    constructor() {
        this.apiKey = process.env.CLOUDFLARE_API_KEY || "";
        this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
        // this.model = process.env.CLOUDFLARE_MODEL || "@cf/qwen/qwen3-30b-a3b-fp8";
        this.model = "@cf/mistralai/mistral-small-3.1-24b-instruct";

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
                body.max_tokens = 32000;
            }

            // Add tools if provided
            if (tools && tools.length > 0) {
                body.tools = tools;
                body.tool_choice = request.tool_choice || "auto";
            }

            log(body)
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
            console.log(data.result)
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
        // Handle Cloudflare's native response format
        // Response can have: response (string), usage (object), tool_calls (array)
        if (data.response === undefined && !data.tool_calls) {
            throw new Error("No response from Cloudflare Workers AI");
        }

        // Determine finish reason based on presence of tool_calls
        let finishReason: LLMResponse["finish_reason"] = "stop";
        if (data.tool_calls && data.tool_calls.length > 0) {
            finishReason = "tool_calls";
        }

        // Convert tool_calls to the expected format if present
        let toolCalls: ToolCall[] | undefined;
        if (data.tool_calls && data.tool_calls.length > 0) {
            toolCalls = data.tool_calls.map((tc: any, index: number) => ({
                id: `call_${index}`,
                type: "function" as const,
                function: {
                    name: tc.name,
                    arguments: typeof tc.arguments === "string"
                        ? tc.arguments
                        : JSON.stringify(tc.arguments)
                }
            }));
        }

        return {
            content: data.response || null,
            tool_calls: toolCalls,
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
            const model = '@cf/qwen/qwen3-embedding-0.6b'
            for (const text of texts) {
                const response = await fetch(
                    `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${model}`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${this.apiKey}`
                        },
                        body: JSON.stringify({
                            text
                        })
                    }
                );

                if (!response.ok) {
                    throw new Error(`Embedding error: ${response.statusText}`);
                }

                const data = await response.json();
                if (data.result) {
                    embeddings.push(data.result);
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