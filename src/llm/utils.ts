/**
 * Normalizes tool definitions to a standard format.
 * Handles both flat (DeepResearchTool) and nested (OpenAI-compatible) formats.
 */
export function normalizeTool(tool: any): {
    name: string;
    description: string;
    parameters: any;
} {
    // Check if it's already in the nested format: { type: "function", function: { name, ... } }
    if (tool.function && tool.function.name) {
        return {
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters
        };
    }

    // Check if it's in the flat format: { name, description, parameters }
    if (tool.name && tool.parameters) {
        return {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
        };
    }

    // Fallback or error
    console.warn("[LLM Utils] Unrecognized tool format:", JSON.stringify(tool));
    return {
        name: tool.name || "unknown",
        description: tool.description || "",
        parameters: tool.parameters || { type: "object", properties: {} }
    };
}
