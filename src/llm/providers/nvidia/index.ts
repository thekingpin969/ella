// src/llm/providers/nvidia/index.ts
import { LLMProvider, LLMRequest, LLMResponse } from "../../types";
import { logger } from "../../../utils/logger";
import { getHandler } from "./handlers";
import { ModelHandler } from "./types";

export class NvidiaProvider implements LLMProvider {
    name = "nvidia";
    private apiKey: string;
    private model: string;
    private baseUrl = "https://integrate.api.nvidia.com/v1";
    private includeReasoning: boolean;

    constructor() {
        this.apiKey = process.env.NVIDIA_API_KEY || "";
        // this.model = process.env.NVIDIA_MODEL || "minimaxai/minimax-m2.1";
        this.model = "minimaxai/minimax-m2.1";
        // this.model = "z-ai/glm4.7";
        // this.model = "openai/gpt-oss-120b";
        this.includeReasoning = process.env.NVIDIA_INCLUDE_REASONING === "true";

        if (!this.apiKey) {
            throw new Error("NVIDIA_API_KEY not found in environment");
        }

        logger.info(`[NVIDIA] Initialized with model: ${this.model}`);
        if (this.includeReasoning) {
            logger.info(`[NVIDIA] Reasoning extraction enabled`);
        }
    }

    async chat(request: LLMRequest, model: string | null = null): Promise<LLMResponse> {
        try {
            const targetModel = model || this.model;
            const handler = getHandler(targetModel);

            logger.info(`[NVIDIA] Using handler for model: ${targetModel}`);
            logger.debug(`[NVIDIA] Handler pattern: ${handler.modelPattern}`);

            // Convert request using model-specific handler
            const apiRequest = handler.convertRequest(request, targetModel);

            // Make API call
            const response = await this.makeRequest(apiRequest);

            // Parse response using model-specific handler
            return handler.parseResponse(response);

        } catch (error: any) {
            logger.error("[NVIDIA] Chat error:", error);
            throw error;
        }
    }

    /**
     * Make HTTP request to NVIDIA API
     */
    private async makeRequest(body: any): Promise<any> {
        logger.debug("[NVIDIA] Request body:", JSON.stringify(body, null, 2));

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
        logger.debug("[NVIDIA] Response:", JSON.stringify(data, null, 2));
        return data;
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
}
