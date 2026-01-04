import { ToolDefinition } from "./types";
import { ResearchOrchestrator } from "./research/ResearchOrchestrator";

// Create singleton instance
const researchOrchestrator = new ResearchOrchestrator();

export const researchTools: ToolDefinition[] = [
    // Web Search Tool
    {
        name: "web_search",
        description: "Fast, targeted web search for specific information like API docs, versions, or quick facts. Use this for simple queries that need 1-5 searches.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Search query (e.g., 'Stripe API webhook documentation')"
                },
                maxResults: {
                    type: "number",
                    description: "Maximum results to return (default: 5)"
                }
            },
            required: ["query"]
        },
        handler: async (params, context) => {
            try {
                const result = await researchOrchestrator.conductResearch(
                    params.query,
                    context.projectId,
                    {
                        complexity: "simple"
                    }
                );

                return {
                    success: result.success,
                    data: result.success ? {
                        query: result.query,
                        results: result.results,
                        toolCallsUsed: result.toolCallsUsed,
                        timestamp: result.timestamp
                    } : undefined,
                    error: result.error
                };
            } catch (error: any) {
                return {
                    success: false,
                    error: error.message
                };
            }
        }
    },

    // Deep Research Tool
    {
        name: "deep_research",
        description: "Comprehensive multi-source research for complex topics. Use this for architecture decisions, tool evaluations, feasibility studies, or when you need 20+ searches.",
        parameters: {
            type: "object",
            properties: {
                topic: {
                    type: "string",
                    description: "Research topic (e.g., 'Compare Stripe vs PayPal for SaaS billing')"
                },
                focusAreas: {
                    type: "array",
                    description: "Specific areas to focus on (optional)",
                    items: {
                        type: "string"
                    }
                },
                depth: {
                    type: "string",
                    description: "Research depth: quick, moderate, or comprehensive",
                    enum: ["quick", "moderate", "comprehensive"]
                },
                includeAlternatives: {
                    type: "boolean",
                    description: "Include alternative solutions (default: true)"
                },
                riskAssessment: {
                    type: "boolean",
                    description: "Include risk assessment (default: true)"
                }
            },
            required: ["topic"]
        },
        handler: async (params, context) => {
            try {
                const result = await researchOrchestrator.conductResearch(
                    params.topic,
                    context.projectId,
                    {
                        complexity: "complex",
                        focusAreas: params.focusAreas || [],
                        depth: params.depth || "comprehensive",
                        includeAlternatives: params.includeAlternatives ?? true,
                        riskAssessment: params.riskAssessment ?? true
                    }
                );

                return {
                    success: result.success,
                    data: result.success ? {
                        topic: result.query,
                        report: result.results,
                        toolCallsUsed: result.toolCallsUsed,
                        timestamp: result.timestamp
                    } : undefined,
                    error: result.error
                };
            } catch (error: any) {
                return {
                    success: false,
                    error: error.message
                };
            }
        }
    },

    // Auto Research (Smart Router)
    {
        name: "research",
        description: "Automatically determines whether to use web search or deep research based on query complexity. Use this when you're not sure which approach to take.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Research query or topic"
                },
                focusAreas: {
                    type: "array",
                    description: "Optional focus areas for deep research",
                    items: {
                        type: "string"
                    }
                }
            },
            required: ["query"]
        },
        handler: async (params, context) => {
            try {
                const result = await researchOrchestrator.conductResearch(
                    params.query,
                    context.projectId,
                    {
                        complexity: "auto",
                        focusAreas: params.focusAreas || []
                    }
                );

                return {
                    success: result.success,
                    data: result.success ? {
                        query: result.query,
                        researchType: result.researchType,
                        results: result.results,
                        toolCallsUsed: result.toolCallsUsed,
                        timestamp: result.timestamp
                    } : undefined,
                    error: result.error
                };
            } catch (error: any) {
                return {
                    success: false,
                    error: error.message
                };
            }
        }
    },

    // Batch Research
    {
        name: "batch_research",
        description: "Research multiple topics at once. Useful for researching all project dependencies simultaneously.",
        parameters: {
            type: "object",
            properties: {
                queries: {
                    type: "array",
                    description: "Array of research queries",
                    items: {
                        type: "string"
                    }
                }
            },
            required: ["queries"]
        },
        handler: async (params, context) => {
            try {
                const result = await researchOrchestrator.batchResearch(
                    params.queries,
                    context.projectId,
                    { complexity: "auto" }
                );

                return {
                    success: result.success,
                    data: {
                        totalQueries: result.totalQueries,
                        results: result.results,
                        timestamp: result.timestamp
                    }
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
