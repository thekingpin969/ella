import { Context } from "../engin/types/context";

export interface ToolParameter {
    type: string;
    description: string;
    enum?: string[];
    items?: any;
}

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: Record<string, ToolParameter>;
        required: string[];
    };
    handler: (params: any, context: Context) => Promise<ToolResult>;
}

export interface ToolResult {
    success: boolean;
    data?: any;
    error?: string;
}

export interface ToolCall {
    id: string;
    name: string;
    arguments: any;
}

export interface ToolResponse {
    id: string;
    result: ToolResult;
}