// src/tools/index.ts
import { ToolExecutor } from "./executor";
import { memoryTools } from "./memory.tools";
import { fileTools } from "./file.tools";
import { communicationTools } from "./communication.tools";

// Create global tool executor instance
export const toolExecutor = new ToolExecutor();

function RegisterTools() {
    // Register all tools
    toolExecutor.registerTools([
        ...memoryTools,
        ...fileTools,
        ...communicationTools
    ]);

    console.log(`[Tools] Registered ${toolExecutor.getToolNames().length} tools:`);
    console.log(toolExecutor.getToolNames().join(", "));
}

// Export everything
export * from "./types";
export * from "./executor";
export { memoryTools } from "./memory.tools";
export { fileTools } from "./file.tools";
export { communicationTools } from "./communication.tools";
export { RegisterTools }