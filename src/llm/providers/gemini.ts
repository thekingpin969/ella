// src/llm/providers/gemini.ts
import { LLMProvider, LLMRequest, LLMResponse, Message, ToolCall } from "../types";

export class GeminiProvider implements LLMProvider {
    name = "gemini";
    private apiKey: string;
    private model: string;
    private baseUrl = "https://generativelanguage.googleapis.com/v1beta";

    constructor() {
        // this.apiKey = process.env.GEMINI_API_KEY || "AIzaSyAx5qpd9nuvMlCDFBlWzd2RirpSIglDU8Q";
        this.apiKey = 'AIzaSyDNIy47IZEGGxHlKhr-NbAAaP197H2_K4U';
        // this.model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
        this.model = 'gemini-2.5-flash-lite';

        if (!this.apiKey) {
            throw new Error("GEMINI_API_KEY not found in environment");
        }

        console.log(`[Gemini] Initialized with model: ${this.model}`);
    }

    async chat(request: LLMRequest): Promise<LLMResponse> {
        try {
            const geminiMessages = this.convertMessages(request.messages);
            const geminiTools = request.tools ? this.convertTools(request.tools) : undefined;

            const body: any = {
                contents: geminiMessages,
                generationConfig: {
                    temperature: request.temperature || 0.7,
                    // maxOutputTokens: request.max_tokens || 8192
                }
            };

            if (geminiTools && geminiTools.length > 0) {
                body.tools = [{ functionDeclarations: geminiTools }];
            }

            const response = await fetch(
                `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body)
                }
            );

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Gemini API error (${response.status}): ${error}`);
            }

            const data = await response.json();
            return this.parseResponse(data);

        } catch (error: any) {
            console.error("[Gemini] Chat error:", error);
            throw error;
        }
    }

    private convertMessages(messages: Message[]): any[] {
        const geminiMessages: any[] = [];
        let currentRole: string | null = null;
        let currentParts: any[] = [];

        for (const msg of messages) {
            // Gemini uses "model" instead of "assistant"
            const role = msg.role === "assistant" ? "model" : msg.role === "system" ? "user" : msg.role;

            // Handle tool results
            if (msg.role === "tool") {
                currentParts.push({
                    functionResponse: {
                        name: msg.name || "unknown",
                        response: { result: msg.content }
                    }
                });
                continue;
            }

            // Merge consecutive messages with same role
            if (role === currentRole) {
                currentParts.push({ text: msg.content });
            } else {
                // Flush previous message
                if (currentRole && currentParts.length > 0) {
                    geminiMessages.push({
                        role: currentRole,
                        parts: currentParts
                    });
                }

                // Start new message
                currentRole = role;
                currentParts = [{ text: msg.content }];
            }

            // Handle tool calls
            if (msg.tool_calls) {
                for (const tc of msg.tool_calls) {
                    const args = typeof tc.function.arguments === "string"
                        ? JSON.parse(tc.function.arguments)
                        : tc.function.arguments;

                    currentParts.push({
                        functionCall: {
                            name: tc.function.name,
                            args
                        }
                    });
                }
            }
        }

        // Flush last message
        if (currentRole && currentParts.length > 0) {
            geminiMessages.push({
                role: currentRole,
                parts: currentParts
            });
        }

        return geminiMessages;
    }

    private convertTools(tools: any[]): any[] {
        return tools.map(tool => ({
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters
        }));
    }

    private parseResponse(data: any): LLMResponse {
        const candidate = data.candidates?.[0];
        if (!candidate) {
            throw new Error("No response from Gemini");
        }

        const content = candidate.content;
        let textContent: string | null = null;
        const toolCalls: ToolCall[] = [];

        // Extract text and function calls
        for (const part of content.parts || []) {
            if (part.text) {
                textContent = (textContent || "") + part.text;
            }

            if (part.functionCall) {
                toolCalls.push({
                    id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    type: "function",
                    function: {
                        name: part.functionCall.name,
                        arguments: JSON.stringify(part.functionCall.args)
                    }
                });
            }
        }

        // Determine finish reason
        let finishReason: LLMResponse["finish_reason"] = "stop";
        if (toolCalls.length > 0) {
            finishReason = "tool_calls";
        } else if (candidate.finishReason === "MAX_TOKENS") {
            finishReason = "length";
        } else if (candidate.finishReason === "SAFETY") {
            finishReason = "content_filter";
        }

        return {
            content: textContent,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
            finish_reason: finishReason,
            usage: data.usageMetadata ? {
                prompt_tokens: data.usageMetadata.promptTokenCount || 0,
                completion_tokens: data.usageMetadata.candidatesTokenCount || 0,
                total_tokens: data.usageMetadata.totalTokenCount || 0
            } : undefined
        };
    }
}