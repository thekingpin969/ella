// src/tools/index.ts
import { ToolExecutor } from "./executor";
import { logger } from "../utils/logger";
import { memoryTools } from "./memory.tools";
import { fileTools } from "./file.tools";
import { communicationTools } from "./communication.tools";
import { researchTools } from "./research.tools";

// Create global tool executor instance
export const toolExecutor = new ToolExecutor();

function RegisterTools() {
    // Register all tools
    toolExecutor.registerTools([
        ...memoryTools,
        ...fileTools,
        // ...communicationTools,
        ...researchTools
    ]);

    logger.info(`[Tools] Registered ${toolExecutor.getToolNames().length} tools:`);
    logger.info(toolExecutor.getToolNames().join(", "));
}

// Export everything
export * from "./types";
export * from "./executor";
export { memoryTools } from "./memory.tools";
export { fileTools } from "./file.tools";
export { communicationTools } from "./communication.tools";
export { researchTools } from "./research.tools";
export { RegisterTools }