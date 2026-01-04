// src/llm/LLMService.ts
import { LLMProvider as ILLMProvider, LLMRequest, LLMResponse, Message } from "./types";
import { GeminiProvider } from "./providers/gemini";
import { OpenRouterProvider } from "./providers/openrouter";
import { CloudflareProvider } from "./providers/cloudflare";
import { ClaudeProvider } from "./providers/claude";

export class LLMService {
    private provider: ILLMProvider;
    private conversationHistory: Map<string, Message[]> = new Map();

    constructor() {
        // For now, only Gemini (testing)
        // Later: switch based on env or agent type
        const providerName = process.env.LLM_PROVIDER || "gemini";

        switch (providerName) {
            case "gemini":
                this.provider = new GeminiProvider();
                break;
            case "openrouter":
                this.provider = new OpenRouterProvider();
                break;
            case "cloudflare":
                this.provider = new CloudflareProvider();
                break;
            case "claude":
                this.provider = new ClaudeProvider();
                break;
            // TODO: Add DeepSeek, Qwen, MiniMax
            default:
                this.provider = new OpenRouterProvider();
                throw new Error(`Unknown LLM provider: ${providerName}`);
        }

        console.log(`[LLMService] Using provider: ${this.provider.name}`);
    }

    /**
     * Send chat request
     */
    async chat(request: LLMRequest): Promise<LLMResponse> {
        console.log(`[LLM] Chat request with ${request.messages.length} messages`);
        if (request.tools) {
            console.log(`[LLM] Tools available: ${request.tools.length}`);
        }

        const response = await this.provider.chat(request);

        console.log(`[LLM] Response: ${response.finish_reason}`);
        if (response.usage) {
            console.log(`[LLM] Tokens: ${response.usage.total_tokens} (${response.usage.prompt_tokens} + ${response.usage.completion_tokens})`);
        }

        return response;
    }

    /**
     * Store conversation for a context
     */
    storeConversation(contextId: string, messages: Message[]): void {
        this.conversationHistory.set(contextId, messages);
    }

    /**
     * Get conversation history
     */
    getConversation(contextId: string): Message[] {
        return this.conversationHistory.get(contextId) || [];
    }

    /**
     * Add message to conversation
     */
    addMessage(contextId: string, message: Message): void {
        const history = this.getConversation(contextId);
        history.push(message);
        this.conversationHistory.set(contextId, history);
    }

    /**
     * Clear conversation
     */
    clearConversation(contextId: string): void {
        this.conversationHistory.delete(contextId);
    }

    /**
     * Get provider info
     */
    getProviderInfo(): { name: string } {
        return {
            name: this.provider.name
        };
    }
}

// Singleton instance
export const llmService = new LLMService();