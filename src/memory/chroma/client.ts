// src/memory/chroma/client.ts
import { ChromaClient, Collection, CloudClient } from "chromadb";

class ChromaDBManager {
    private client: ChromaClient;
    private collections: Map<string, Collection> = new Map();
    private initialized: boolean = false;

    constructor() {
        // this.client = new ChromaClient({
        //     path: process.env.CHROMA_URL || "http://localhost:8000"
        // });
        this.client = new CloudClient({
            apiKey: process.env.CHROMA_API_KEY,
            tenant: process.env.CHROMA_TENANT,
            database: process.env.CHROMA_DATABASE
        });
    }

    /**
     * Initialize ChromaDB collections
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            console.log("[ChromaDB] Initializing collections...");

            // Global Memory Collection
            const globalCollection = await this.client.getOrCreateCollection({
                name: "global_memory",
                metadata: {
                    description: "E.L.L.A's long-term preferences and patterns",
                    layer: "global"
                }
            });
            this.collections.set("global_memory", globalCollection);

            console.log("[ChromaDB] ✅ Global memory collection ready");
            this.initialized = true;
        } catch (error) {
            console.error("[ChromaDB] ❌ Initialization failed:", error);
            throw error;
        }
    }

    /**
     * Get or create project-specific collection
     */
    async getProjectCollection(projectId: string): Promise<Collection> {
        const collectionName = `project_${projectId}`;

        if (this.collections.has(collectionName)) {
            return this.collections.get(collectionName)!;
        }

        try {
            const collection = await this.client.getOrCreateCollection({
                name: collectionName,
                metadata: {
                    projectId,
                    layer: "project",
                    createdAt: new Date().toISOString()
                }
            });

            this.collections.set(collectionName, collection);
            console.log(`[ChromaDB] ✅ Project collection created: ${collectionName}`);
            return collection;
        } catch (error) {
            console.error(`[ChromaDB] ❌ Failed to create project collection:`, error);
            throw error;
        }
    }

    /**
     * Get global memory collection
     */
    getGlobalCollection(): Collection {
        if (!this.initialized) {
            throw new Error("ChromaDB not initialized. Call initialize() first.");
        }
        return this.collections.get("global_memory")!;
    }

    /**
     * Delete project collection
     */
    async deleteProjectCollection(projectId: string): Promise<void> {
        const collectionName = `project_${projectId}`;
        try {
            await this.client.deleteCollection({ name: collectionName });
            this.collections.delete(collectionName);
            console.log(`[ChromaDB] 🗑️ Deleted collection: ${collectionName}`);
        } catch (error) {
            console.error(`[ChromaDB] ❌ Failed to delete collection:`, error);
        }
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<boolean> {
        try {
            await this.client.heartbeat();
            return true;
        } catch (error) {
            console.error("[ChromaDB] ❌ Health check failed:", error);
            return false;
        }
    }

    /**
     * Get stats
     */
    async getStats(): Promise<any> {
        try {
            const collections = await this.client.listCollections();
            return {
                totalCollections: collections.length,
                collections: collections.map(c => ({
                    name: c.name,
                    metadata: c.metadata
                }))
            };
        } catch (error) {
            console.error("[ChromaDB] ❌ Failed to get stats:", error);
            return null;
        }
    }
}

// Singleton instance
export const chromaDB = new ChromaDBManager();