// src/llm/providers/claude.ts
import { log } from "console";
import { LLMProvider, LLMRequest, LLMResponse, Message, ToolCall } from "../types";

/**
 * Claude (Anthropic) Provider for E.L.L.A
 * Uses Anthropic's Messages API
 * 
 * Recommended models for E.L.L.A:
 * - claude-sonnet-4-5 (Best reasoning & coding)
 * - claude-opus-4 (Most capable, slower)
 * - claude-haiku-4-5 (Fastest, efficient)
 * - claude-3-7-sonnet (Balanced)
 */
export class ClaudeProvider implements LLMProvider {
    name = "claude";
    private apiKey: string;
    private model: string;
    // private baseUrl = "https://api.anthropic.com";
    private baseUrl = "http://localhost:1234";
    private apiVersion = "2023-06-01";

    constructor() {
        this.apiKey = process.env.ANTHROPIC_API_KEY || "";
        // this.model = process.env.CLAUDE_MODEL || "claude-sonnet-4-5";
        this.model = "gemini-3-pro-high";

        if (!this.apiKey) {
            throw new Error("ANTHROPIC_API_KEY not found in environment");
        }

        console.log(`[Claude] Initialized with model: ${this.model}`);
    }

    async chat(request: LLMRequest): Promise<LLMResponse> {
        try {
            const messages = this.convertMessages(request.messages);
            const tools = request.tools ? this.convertTools(request.tools) : undefined;

            // Extract system message if present
            let systemPrompt: string | undefined = undefined;
            const systemMessage = request.messages.find(m => m.role === "system");
            if (systemMessage) {
                systemPrompt = systemMessage.content;
            }

            const body: any = {
                model: this.model,
                // max_tokens: request.max_tokens || 8192,
                messages: messages.filter(m => m.role !== "system"), // Remove system from messages
            };

            // Add system prompt separately (Claude's format)
            if (systemPrompt) {
                body.system = systemPrompt;
            }

            // Add optional parameters
            if (request.temperature !== undefined) {
                body.temperature = request.temperature;
            }

            // Add tools if provided
            if (tools && tools.length > 0) {
                body.tools = tools;
                body.tool_choice = this.convertToolChoice(request.tool_choice);
            }

            const response = await fetch(`${this.baseUrl}/v1/messages`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": this.apiKey,
                    "anthropic-version": this.apiVersion
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Claude API error (${response.status}): ${error}`);
            }

            const data = await response.json();
            return this.parseResponse(data);

        } catch (error: any) {
            console.error("[Claude] Chat error:", error);
            throw error;
        }
    }

    private convertMessages(messages: Message[]): any[] {
        return messages
            .filter(msg => msg.role !== "system") // System handled separately
            .map(msg => {
                const converted: any = {
                    role: msg.role === "tool" ? "user" : msg.role, // Claude uses "user" for tool results
                    content: msg.content
                };

                // Handle tool calls (assistant calling tools)
                if (msg.tool_calls && msg.tool_calls.length > 0) {
                    // Claude expects content as array with tool_use blocks
                    converted.content = msg.tool_calls.map(tc => ({
                        type: "tool_use",
                        id: tc.id,
                        name: tc.function.name,
                        input: typeof tc.function.arguments === "string"
                            ? JSON.parse(tc.function.arguments)
                            : tc.function.arguments
                    }));
                }

                // Handle tool results
                if (msg.tool_call_id) {
                    converted.content = [{
                        type: "tool_result",
                        tool_use_id: msg.tool_call_id,
                        content: msg.content
                    }];
                }

                return converted;
            });
    }

    private convertTools(tools: any[]): any[] {
        // Claude uses different tool format
        // console.log(tools)
        return tools.map(tool => {
            console.log(tool, 'cc')
            return {
                name: tool.function.name,
                description: tool.function.description,
                input_schema: tool.function.parameters
            }
        });
    }

    private convertToolChoice(toolChoice?: "auto" | "required" | "none"): any {
        if (!toolChoice || toolChoice === "auto") {
            return { type: "auto" };
        }
        if (toolChoice === "required") {
            return { type: "any" };
        }
        if (toolChoice === "none") {
            return { type: "none" };
        }
        return { type: "auto" };
    }

    private parseResponse(data: any): LLMResponse {
        // Claude response format:
        // {
        //   id: "msg_...",
        //   type: "message",
        //   role: "assistant",
        //   content: [{ type: "text", text: "..." }],
        //   stop_reason: "end_turn",
        //   usage: { input_tokens, output_tokens }
        // }

        if (!data.content || data.content.length === 0) {
            throw new Error("No content in Claude response");
        }

        let textContent: string | null = null;
        const toolCalls: ToolCall[] = [];

        // Parse content blocks
        for (const block of data.content) {
            if (block.type === "text") {
                textContent = (textContent || "") + block.text;
            } else if (block.type === "tool_use") {
                toolCalls.push({
                    id: block.id,
                    type: "function",
                    function: {
                        name: block.name,
                        arguments: JSON.stringify(block.input)
                    }
                });
            }
        }

        // Map stop_reason
        let finishReason: LLMResponse["finish_reason"] = "stop";
        if (data.stop_reason === "tool_use") {
            finishReason = "tool_calls";
        } else if (data.stop_reason === "max_tokens") {
            finishReason = "length";
        } else if (data.stop_reason === "stop_sequence") {
            finishReason = "stop";
        }

        return {
            content: textContent,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
            finish_reason: finishReason,
            usage: data.usage ? {
                prompt_tokens: data.usage.input_tokens || 0,
                completion_tokens: data.usage.output_tokens || 0,
                total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0)
            } : undefined
        };
    }

    /**
     * Get available models
     */
    async getAvailableModels(): Promise<any[]> {
        try {
            const response = await fetch(`${this.baseUrl}/v1/models`, {
                headers: {
                    "x-api-key": this.apiKey,
                    "anthropic-version": this.apiVersion
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch models: ${response.statusText}`);
            }

            const data = await response.json();
            return data.data || [];
        } catch (error) {
            console.error("[Claude] Failed to fetch models:", error);
            return [];
        }
    }

    /**
     * Get model info
     */
    getModelInfo(): { name: string; provider: string } {
        return {
            name: this.model,
            provider: "anthropic"
        };
    }
}
