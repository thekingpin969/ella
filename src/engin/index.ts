import { StageEngine } from "./StageEngine";

// Create singleton instance
export const stageEngine = new StageEngine();

// Export types
export * from "./types/context";
export * from "./types/events";
export * from "./types/stages";
