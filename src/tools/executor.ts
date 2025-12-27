// src/tools/executor.ts
import { Context } from "../engin/types/context";
import { ToolCall, ToolResponse, ToolDefinition } from "./types";
import { v4 as uuidv4 } from "uuid";

export class ToolExecutor {
    private tools: Map<string, ToolDefinition> = new Map();

    constructor() {
        console.log("[ToolExecutor] Initialized");
    }

    /**
     * Register a tool
     */
    registerTool(tool: ToolDefinition): void {
        this.tools.set(tool.name, tool);
        console.log(`[ToolExecutor] Registered tool: ${tool.name}`);
    }

    /**
     * Register multiple tools
     */
    registerTools(tools: ToolDefinition[]): void {
        tools.forEach(tool => this.registerTool(tool));
    }

    /**
     * Get all registered tools
     */
    getTools(): ToolDefinition[] {
        return Array.from(this.tools.values());
    }

    /**
     * Get tool definitions for LLM (OpenAI format)
     */
    getToolDefinitions(): any[] {
        return this.getTools().map(tool => ({
            type: "function",
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
            }
        }));
    }

    /**
     * Execute a tool call
     */
    async executeTool(
        toolCall: ToolCall,
        context: Context
    ): Promise<ToolResponse> {
        const tool = this.tools.get(toolCall.name);

        if (!tool) {
            return {
                id: toolCall.id,
                result: {
                    success: false,
                    error: `Tool '${toolCall.name}' not found`
                }
            };
        }

        try {
            console.log(`[ToolExecutor] Executing: ${toolCall.name}`);
            console.log(`[ToolExecutor] Arguments:`, toolCall.arguments);

            const result = await tool.handler(toolCall.arguments, context);

            console.log(`[ToolExecutor] Result:`, result.success ? "✅" : "❌");

            return {
                id: toolCall.id,
                result
            };
        } catch (error: any) {
            console.error(`[ToolExecutor] Error executing ${toolCall.name}:`, error);
            return {
                id: toolCall.id,
                result: {
                    success: false,
                    error: error.message
                }
            };
        }
    }

    /**
     * Execute multiple tool calls in parallel
     */
    async executeTools(
        toolCalls: ToolCall[],
        context: Context
    ): Promise<ToolResponse[]> {
        return Promise.all(
            toolCalls.map(call => this.executeTool(call, context))
        );
    }

    /**
     * Parse tool calls from LLM response
     */
    parseToolCalls(llmResponse: any): ToolCall[] {
        if (!llmResponse.tool_calls) {
            return [];
        }

        return llmResponse.tool_calls.map((tc: any) => ({
            id: tc.id || uuidv4(),
            name: tc.function.name,
            arguments: typeof tc.function.arguments === "string"
                ? JSON.parse(tc.function.arguments)
                : tc.function.arguments
        }));
    }

    /**
     * Format tool responses for LLM
     */
    formatToolResponses(responses: ToolResponse[]): any[] {
        return responses.map(response => ({
            tool_call_id: response.id,
            role: "tool",
            name: response.result.success ? "success" : "error",
            content: JSON.stringify(response.result)
        }));
    }

    /**
     * Get available tool names
     */
    getToolNames(): string[] {
        return Array.from(this.tools.keys());
    }

    /**
     * Check if tool exists
     */
    hasTool(name: string): boolean {
        return this.tools.has(name);
    }
}