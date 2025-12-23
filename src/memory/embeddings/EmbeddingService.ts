// src/memory/embeddings/EmbeddingService.ts

/**
 * FREE Embedding Service for E.L.L.A
 * Primary: OpenAI (cheap: $0.02/1M tokens)
 * Fallback: Ollama (local, free) or simple embeddings
 */

interface EmbeddingResponse {
    embedding?: number[];
    embeddings?: number[][];
    data?: Array<{ embedding: number[] }>;
}

type EmbeddingProvider = "ollama" | "openai" | "fallback";

export class EmbeddingService {
    private provider: EmbeddingProvider;
    private ollamaUrl: string;
    private openaiKey: string | null;
    private ollamaModel: string;

    constructor() {
        this.ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
        this.openaiKey = process.env.OPENAI_API_KEY || null;
        this.ollamaModel = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";

        // Determine provider based on env
        if (process.env.EMBEDDING_PROVIDER === "openai" && this.openaiKey) {
            this.provider = "openai";
            console.log("[Embeddings] Using OpenAI (text-embedding-3-small)");
        } else if (process.env.EMBEDDING_PROVIDER === "ollama") {
            this.provider = "ollama";
            console.log(`[Embeddings] Using Ollama (${this.ollamaModel})`);
        } else if (this.openaiKey) {
            // Default to OpenAI if key exists
            this.provider = "openai";
            console.log("[Embeddings] Using OpenAI (text-embedding-3-small)");
        } else {
            this.provider = "ollama";
            console.log("[Embeddings] Using Ollama (will fallback if unavailable)");
        }
    }

    /**
     * Generate embeddings for text/code
     */
    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        if (!texts || texts.length === 0) {
            throw new Error("No texts provided for embedding");
        }

        try {
            switch (this.provider) {
                case "ollama":
                    return await this.ollamaEmbeddings(texts);
                case "openai":
                    return await this.openaiEmbeddings(texts);
                default:
                    return this.fallbackEmbeddings(texts);
            }
        } catch (error) {
            console.error(`[Embeddings] ${this.provider} failed:`, error);
            console.log("[Embeddings] Falling back to simple embeddings");
            return this.fallbackEmbeddings(texts);
        }
    }

    /**
     * Generate single embedding
     */
    async generateEmbedding(text: string): Promise<number[]> {
        const embeddings = await this.generateEmbeddings([text]);
        return embeddings[0];
    }

    // ==========================================
    // OLLAMA (100% FREE, LOCAL)
    // ==========================================

    /**
     * Generate embeddings using Ollama
     */
    private async ollamaEmbeddings(texts: string[]): Promise<number[][]> {
        const embeddings: number[][] = [];

        for (const text of texts) {
            const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: this.ollamaModel,
                    prompt: text
                })
            });

            if (!response.ok) {
                throw new Error(`Ollama error: ${response.statusText}`);
            }

            const data: EmbeddingResponse = await response.json();
            if (!data.embedding) {
                throw new Error("No embedding returned from Ollama");
            }

            embeddings.push(data.embedding);
        }

        return embeddings;
    }

    /**
     * Check if Ollama is running
     */
    private async isOllamaAvailable(): Promise<boolean> {
        try {
            const response = await fetch(`${this.ollamaUrl}/api/tags`, {
                method: "GET",
                signal: AbortSignal.timeout(2000)
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    // ==========================================
    // OPENAI (CHEAP: $0.02 per 1M tokens)
    // ==========================================

    /**
     * Generate embeddings using OpenAI
     * Model: text-embedding-3-small ($0.02 per 1M tokens)
     */
    private async openaiEmbeddings(texts: string[]): Promise<number[][]> {
        if (!this.openaiKey) {
            throw new Error("OpenAI API key not found");
        }

        const response = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.openaiKey}`
            },
            body: JSON.stringify({
                model: "text-embedding-3-small",
                input: texts
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI error (${response.status}): ${error}`);
        }

        const data: EmbeddingResponse = await response.json();
        if (!data.data) {
            throw new Error("No embeddings returned from OpenAI");
        }

        return data.data.map(item => item.embedding);
    }

    // ==========================================
    // FALLBACK (SIMPLE, NO API NEEDED)
    // ==========================================

    /**
     * Simple fallback when no API available
     */
    private fallbackEmbeddings(texts: string[]): number[][] {
        const dimension = 768;

        return texts.map(text => {
            const embedding = new Array(dimension).fill(0);

            const normalized = text.toLowerCase().replace(/[^\w\s]/g, '');
            const words = normalized.split(/\s+/);

            words.forEach((word, idx) => {
                for (let i = 0; i < word.length; i++) {
                    const charCode = word.charCodeAt(i);
                    const position = (charCode * (idx + 1) * (i + 1)) % dimension;
                    embedding[position] += 1 / (idx + 1);
                }
            });

            const magnitude = Math.sqrt(
                embedding.reduce((sum, val) => sum + val * val, 0)
            );

            return magnitude > 0
                ? embedding.map(val => val / magnitude)
                : embedding;
        });
    }

    // ==========================================
    // HEALTH CHECK
    // ==========================================

    /**
     * Check if embedding service is available
     */
    async healthCheck(): Promise<{
        available: boolean;
        provider: EmbeddingProvider;
        details: string;
    }> {
        // Check Ollama first if it's the provider
        if (this.provider === "ollama") {
            const ollamaOk = await this.isOllamaAvailable();
            if (ollamaOk) {
                return {
                    available: true,
                    provider: "ollama",
                    details: `Ollama running locally (${this.ollamaModel}, FREE)`
                };
            }
        }

        // Check OpenAI
        if (this.openaiKey) {
            try {
                await this.generateEmbedding("test");
                return {
                    available: true,
                    provider: "openai",
                    details: "OpenAI API ($0.02/1M tokens)"
                };
            } catch (error) {
                console.error("[Embeddings] OpenAI test failed:", error);
            }
        }

        // Fallback always works
        return {
            available: true,
            provider: "fallback",
            details: "Using simple fallback (no API needed)"
        };
    }

    /**
     * Get cost estimate for OpenAI
     */
    estimateCost(texts: string[]): { tokens: number; cost: number } {
        if (this.provider !== "openai") {
            return { tokens: 0, cost: 0 };
        }

        // Rough estimate: 1 token ≈ 4 characters
        const totalChars = texts.reduce((sum, text) => sum + text.length, 0);
        const tokens = Math.ceil(totalChars / 4);
        const cost = (tokens / 1_000_000) * 0.02;

        return { tokens, cost };
    }
}

// Singleton instance
export const embeddingService = new EmbeddingService();