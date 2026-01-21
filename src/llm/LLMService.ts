// src/llm/LLMService.ts
import { LLMProvider as ILLMProvider, LLMRequest, LLMResponse, Message } from "./types";
import { logger } from "../utils/logger";
import { GeminiProvider } from "./providers/gemini";
import { OpenRouterProvider } from "./providers/openrouter";
import { CloudflareProvider } from "./providers/cloudflare";
import { ClaudeProvider } from "./providers/claude";
import { NvidiaProvider } from "./providers/nvidia";

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
            case "nvidia":
                this.provider = new NvidiaProvider();
                break;
            // TODO: Add DeepSeek, Qwen, MiniMax
            default:
                this.provider = new OpenRouterProvider();
                throw new Error(`Unknown LLM provider: ${providerName}`);
        }

        logger.info(`[LLMService] Using provider: ${this.provider.name}`);
    }

    /**
     * Send chat request
     */
    async chat(request: LLMRequest): Promise<LLMResponse> {
        logger.info(`[LLM] Chat request with ${request.messages.length} messages`);
        if (request.tools) {
            logger.debug(`[LLM] Tools available: ${request.tools.length}`);
        }

        const response = await this.provider.chat(request);

        logger.info(`[LLM] Response: ${response.finish_reason}`);
        if (response.usage) {
            logger.debug(`[LLM] Tokens: ${response.usage.total_tokens} (${response.usage.prompt_tokens} + ${response.usage.completion_tokens})`);
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