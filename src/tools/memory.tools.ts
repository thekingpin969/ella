// src/tools/memory.tools.ts
import { ToolDefinition } from "./types";
import { memoryService } from "../memory";

export const memoryTools: ToolDefinition[] = [
    // Query Project Memory
    {
        name: "query_project_memory",
        description: "Search project memory for relevant context, decisions, or past work. Use this when you need to understand what was done before or find specific information.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Natural language search query (e.g., 'How is authentication implemented?')"
                },
                limit: {
                    type: "number",
                    description: "Number of results to return (default: 5)"
                }
            },
            required: ["query"]
        },
        handler: async (params, context) => {
            try {
                const results = await memoryService.queryProject(
                    context.projectId,
                    params.query,
                    params.limit || 5
                );

                return {
                    success: true,
                    data: {
                        results: results.map(r => ({
                            content: r.content,
                            score: r.score,
                            metadata: r.metadata
                        })),
                        count: results.length
                    }
                };
            } catch (error: any) {
                return {
                    success: false,
                    error: error.message
                };
            }
        }
    },

    // Store Project Memory
    {
        name: "store_project_memory",
        description: "Save important information to project memory. Use this for decisions, completed work, patterns, or anything that should be remembered.",
        parameters: {
            type: "object",
            properties: {
                content: {
                    type: "string",
                    description: "Information to store"
                },
                metadata: {
                    type: "object",
                    description: "Additional metadata (type, importance, etc.)"
                }
            },
            required: ["content"]
        },
        handler: async (params, context) => {
            try {
                const id = await memoryService.storeProject(
                    context.projectId,
                    params.content,
                    params.metadata || {}
                );

                return {
                    success: true,
                    data: { id, stored: params.content }
                };
            } catch (error: any) {
                return {
                    success: false,
                    error: error.message
                };
            }
        }
    },

    // Query Global Memory
    {
        name: "query_global_memory",
        description: "Search global memory for coding patterns, preferences, and best practices that apply across all projects.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "What you want to know (e.g., 'How should I structure error handling?')"
                },
                limit: {
                    type: "number",
                    description: "Number of results (default: 3)"
                }
            },
            required: ["query"]
        },
        handler: async (params, context) => {
            try {
                const results = await memoryService.queryGlobal(
                    params.query,
                    params.limit || 3
                );

                return {
                    success: true,
                    data: {
                        results: results.map(r => ({
                            content: r.content,
                            score: r.score,
                            metadata: r.metadata
                        })),
                        count: results.length
                    }
                };
            } catch (error: any) {
                return {
                    success: false,
                    error: error.message
                };
            }
        }
    },

    // Store Global Memory
    {
        name: "store_global_memory",
        description: "Save stable patterns and preferences to global memory. Use this for coding styles, architectural patterns, or anything that should apply to all future projects.",
        parameters: {
            type: "object",
            properties: {
                content: {
                    type: "string",
                    description: "Pattern or preference to remember"
                },
                metadata: {
                    type: "object",
                    description: "Metadata including stability level (low/medium/high/permanent)"
                }
            },
            required: ["content", "metadata"]
        },
        handler: async (params, context) => {
            try {
                const id = await memoryService.storeGlobal(
                    params.content,
                    params.metadata
                );

                return {
                    success: true,
                    data: { id, stored: params.content }
                };
            } catch (error: any) {
                return {
                    success: false,
                    error: error.message
                };
            }
        }
    },

    // Get Session Memory
    {
        name: "get_session_memory",
        description: "Retrieve temporary session data for current task",
        parameters: {
            type: "object",
            properties: {
                key: {
                    type: "string",
                    description: "Session key to retrieve"
                }
            },
            required: ["key"]
        },
        handler: async (params, context) => {
            try {
                const doc = memoryService.getSession(context.projectId, params.key);

                if (!doc) {
                    return {
                        success: false,
                        error: "Key not found in session"
                    };
                }

                return {
                    success: true,
                    data: {
                        content: doc.content,
                        metadata: doc.metadata
                    }
                };
            } catch (error: any) {
                return {
                    success: false,
                    error: error.message
                };
            }
        }
    },

    // Set Session Memory
    {
        name: "set_session_memory",
        description: "Store temporary data for current task (cleared after task completes)",
        parameters: {
            type: "object",
            properties: {
                key: {
                    type: "string",
                    description: "Session key"
                },
                content: {
                    type: "string",
                    description: "Data to store"
                },
                metadata: {
                    type: "object",
                    description: "Optional metadata"
                }
            },
            required: ["key", "content"]
        },
        handler: async (params, context) => {
            try {
                memoryService.setSession(
                    context.projectId,
                    params.key,
                    params.content,
                    params.metadata || {}
                );

                return {
                    success: true,
                    data: { key: params.key, stored: true }
                };
            } catch (error: any) {
                return {
                    success: false,
                    error: error.message
                };
            }
        }
    }
];