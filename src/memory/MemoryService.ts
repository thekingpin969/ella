// src/memory/MemoryService.ts
import { chromaDB } from "./chroma/client";
import { MemoryLayer, MemoryDocument, MemoryQuery, MemoryResult } from "./types";
import { embeddingService } from "./embeddings/EmbeddingService";
import { v4 as uuidv4 } from "uuid";

/**
 * E.L.L.A's 3-Layer Memory System with Embeddings
 * - Session: In-memory (temporary)
 * - Project: ChromaDB (project-specific) with embeddings
 * - Global: ChromaDB (cross-project patterns) with embeddings
 */
export class MemoryService {
    // Session Memory (RAM - cleared after story/task)
    private sessionMemory: Map<string, Map<string, MemoryDocument>> = new Map();

    constructor() {
        console.log("[MemoryService] Initialized");
    }

    /**
     * Initialize ChromaDB & Embedding Service
     */
    async initialize(): Promise<void> {
        await chromaDB.initialize();

        const embeddingHealth = await embeddingService.healthCheck();
        if (!embeddingHealth.available) {
            console.warn("[MemoryService] ⚠️ Embeddings degraded, using fallback");
        } else {
            console.log(`[MemoryService] ✅ Embeddings ready (${embeddingHealth.provider})`);
        }
    }

    // ==========================================
    // SESSION MEMORY (Layer 1 - Temporary RAM)
    // ==========================================

    setSession(projectId: string, key: string, content: string, metadata: any = {}): void {
        if (!this.sessionMemory.has(projectId)) {
            this.sessionMemory.set(projectId, new Map());
        }

        const doc: MemoryDocument = {
            id: key,
            content,
            metadata: {
                layer: MemoryLayer.SESSION,
                projectId,
                type: metadata.type || "temp",
                timestamp: new Date().toISOString(),
                ...metadata
            }
        };

        this.sessionMemory.get(projectId)!.set(key, doc);
        console.log(`[SessionMemory] Stored: ${projectId}/${key}`);
    }

    getSession(projectId: string, key: string): MemoryDocument | null {
        return this.sessionMemory.get(projectId)?.get(key) || null;
    }

    getAllSession(projectId: string): MemoryDocument[] {
        const projectSession = this.sessionMemory.get(projectId);
        return projectSession ? Array.from(projectSession.values()) : [];
    }

    clearSession(projectId: string): void {
        this.sessionMemory.delete(projectId);
        console.log(`[SessionMemory] Cleared: ${projectId}`);
    }

    // ==========================================
    // PROJECT MEMORY (Layer 2 - ChromaDB)
    // ==========================================

    async storeProject(
        projectId: string,
        content: string,
        metadata: any = {}
    ): Promise<string> {
        try {
            const collection = await chromaDB.getProjectCollection(projectId);
            const id = uuidv4();

            // Generate embedding
            const embedding = await embeddingService.generateEmbedding(content);

            await collection.add({
                ids: [id],
                documents: [content],
                embeddings: [embedding],
                metadatas: [{
                    layer: MemoryLayer.PROJECT,
                    projectId,
                    timestamp: new Date().toISOString(),
                    ...metadata
                }]
            });

            console.log(`[ProjectMemory] Stored with embedding: ${projectId}/${id}`);
            return id;
        } catch (error) {
            console.error("[ProjectMemory] Failed to store:", error);
            throw error;
        }
    }

    async storeProjectBatch(
        projectId: string,
        documents: Array<{ content: string; metadata?: any }>
    ): Promise<string[]> {
        try {
            const collection = await chromaDB.getProjectCollection(projectId);

            const contents = documents.map(d => d.content);
            const embeddings = await embeddingService.generateEmbeddings(contents);

            const ids = documents.map(() => uuidv4());
            const metadatas = documents.map((d) => ({
                layer: MemoryLayer.PROJECT,
                projectId,
                timestamp: new Date().toISOString(),
                ...d.metadata
            }));

            await collection.add({
                ids,
                documents: contents,
                embeddings,
                metadatas
            });

            console.log(`[ProjectMemory] Batch stored ${ids.length} documents with embeddings`);
            return ids;
        } catch (error) {
            console.error("[ProjectMemory] Failed to batch store:", error);
            throw error;
        }
    }

    async queryProject(
        projectId: string,
        query: string,
        limit: number = 5,
        filters?: any
    ): Promise<MemoryResult[]> {
        try {
            const collection = await chromaDB.getProjectCollection(projectId);

            const queryEmbedding = await embeddingService.generateEmbedding(query);

            const results = await collection.query({
                queryEmbeddings: [queryEmbedding],
                nResults: limit,
                where: filters
            });

            if (!results.ids[0] || results.ids[0].length === 0) {
                return [];
            }

            return results.ids[0].map((id, idx) => ({
                id: id as string,
                content: results.documents[0][idx] as string,
                score: 1 - (results.distances?.[0]?.[idx] || 0),
                metadata: results.metadatas?.[0]?.[idx] || {}
            }));
        } catch (error) {
            console.error("[ProjectMemory] Query failed:", error);
            return [];
        }
    }

    async getAllProject(projectId: string): Promise<MemoryResult[]> {
        try {
            const collection = await chromaDB.getProjectCollection(projectId);
            const results = await collection.get({});

            if (!results.ids || results.ids.length === 0) {
                return [];
            }

            return results.ids.map((id, idx) => ({
                id: id as string,
                content: results.documents?.[idx] as string || "",
                score: 1.0,
                metadata: results.metadatas?.[idx] || {}
            }));
        } catch (error) {
            console.error("[ProjectMemory] Failed to get all:", error);
            return [];
        }
    }

    async deleteProject(projectId: string): Promise<void> {
        await chromaDB.deleteProjectCollection(projectId);
    }

    // ==========================================
    // GLOBAL MEMORY (Layer 3 - ChromaDB)
    // ==========================================

    async storeGlobal(content: string, metadata: any = {}): Promise<string> {
        try {
            const collection = chromaDB.getGlobalCollection();
            const id = uuidv4();

            const embedding = await embeddingService.generateEmbedding(content);

            await collection.add({
                ids: [id],
                documents: [content],
                embeddings: [embedding],
                metadatas: [{
                    layer: MemoryLayer.GLOBAL,
                    timestamp: new Date().toISOString(),
                    stability: metadata.stability || "medium",
                    ...metadata
                }]
            });

            console.log(`[GlobalMemory] Stored with embedding: ${id}`);
            return id;
        } catch (error) {
            console.error("[GlobalMemory] Failed to store:", error);
            throw error;
        }
    }

    async queryGlobal(
        query: string,
        limit: number = 5,
        filters?: any
    ): Promise<MemoryResult[]> {
        try {
            const collection = chromaDB.getGlobalCollection();

            const queryEmbedding = await embeddingService.generateEmbedding(query);

            const results = await collection.query({
                queryEmbeddings: [queryEmbedding],
                nResults: limit,
                where: filters
            });

            if (!results.ids[0] || results.ids[0].length === 0) {
                return [];
            }

            return results.ids[0].map((id, idx) => ({
                id: id as string,
                content: results.documents[0][idx] as string,
                score: 1 - (results.distances?.[0]?.[idx] || 0),
                metadata: results.metadatas?.[0]?.[idx] || {}
            }));
        } catch (error) {
            console.error("[GlobalMemory] Query failed:", error);
            return [];
        }
    }

    // ==========================================
    // UNIFIED RETRIEVAL (All Layers)
    // ==========================================

    async retrieve(query: MemoryQuery): Promise<MemoryResult[]> {
        const results: MemoryResult[] = [];

        if (query.layer === MemoryLayer.SESSION && query.projectId) {
            const sessionDocs = this.getAllSession(query.projectId);
            const sessionResults = sessionDocs
                .filter(doc => doc.content.toLowerCase().includes(query.query.toLowerCase()))
                .map(doc => ({
                    id: doc.id,
                    content: doc.content,
                    score: 1.0,
                    metadata: doc.metadata
                }));
            results.push(...sessionResults);
        }

        if (query.layer === MemoryLayer.PROJECT && query.projectId) {
            const projectResults = await this.queryProject(
                query.projectId,
                query.query,
                query.limit || 5,
                query.filters
            );
            results.push(...projectResults);
        }

        if (query.layer === MemoryLayer.GLOBAL) {
            const globalResults = await this.queryGlobal(
                query.query,
                query.limit || 5,
                query.filters
            );
            results.push(...globalResults);
        }

        return results;
    }

    // ==========================================
    // MEMORY PROMOTION
    // ==========================================

    async promoteToProject(projectId: string, sessionKey: string): Promise<string | null> {
        const sessionDoc = this.getSession(projectId, sessionKey);
        if (!sessionDoc) {
            console.warn(`[Memory] Cannot promote: session key not found: ${sessionKey}`);
            return null;
        }

        const id = await this.storeProject(projectId, sessionDoc.content, sessionDoc.metadata);
        console.log(`[Memory] Promoted to project: ${sessionKey} → ${id}`);
        return id;
    }

    async promoteToGlobal(projectId: string, content: string, metadata: any): Promise<string> {
        const id = await this.storeGlobal(content, {
            ...metadata,
            sourceProjectId: projectId,
            promotedAt: new Date().toISOString()
        });
        console.log(`[Memory] Promoted to global from project ${projectId}`);
        return id;
    }

    // ==========================================
    // HEALTH & STATS
    // ==========================================

    async getStats(): Promise<any> {
        const sessionProjects = Array.from(this.sessionMemory.keys());
        const sessionCount = sessionProjects.reduce(
            (sum, pid) => sum + (this.sessionMemory.get(pid)?.size || 0),
            0
        );

        const chromaStats = await chromaDB.getStats();
        const embeddingHealth = await embeddingService.healthCheck();

        return {
            session: {
                projects: sessionProjects.length,
                totalDocs: sessionCount
            },
            chroma: chromaStats,
            embeddings: {
                service: embeddingHealth.provider === "openai" ? "OpenAI" :
                    embeddingHealth.provider === "ollama" ? "Ollama" : "Fallback",
                available: embeddingHealth.available
            }
        };
    }

    async healthCheck(): Promise<boolean> {
        const chromaOk = await chromaDB.healthCheck();
        const embeddingOk = await embeddingService.healthCheck();
        return chromaOk && embeddingOk.available;
    }
}

// Singleton instance
export const memoryService = new MemoryService();