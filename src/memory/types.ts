export enum MemoryLayer {
    SESSION = "session",
    PROJECT = "project",
    GLOBAL = "global"
}

export interface MemoryDocument {
    id: string;
    content: string;
    embedding?: number[];
    metadata: {
        layer: MemoryLayer;
        projectId?: string;
        type: string;
        timestamp: string;
        stability?: "low" | "medium" | "high" | "permanent";
        [key: string]: any;
    };
}

export interface MemoryQuery {
    query: string;
    layer: MemoryLayer;
    projectId?: string;
    limit?: number;
    filters?: Record<string, any>;
}

export interface MemoryResult {
    id: string;
    content: string;
    score: number;
    metadata: any;
}