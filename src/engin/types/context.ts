import { Stage, PlanningScreen } from "./stages";
import { UIUXData } from "../handlers/uiuxHandler/types";

export interface Message {
    role: "user" | "assistant";
    content: string;
    timestamp: string;
}

export interface PlanningData {
    currentScreen: PlanningScreen;
    messages: Message[];
    confidence: number;
    initialDescription?: string;
    initialAnalysis?: any;
    clarificationRound?: number;
    askedQuestionIds?: string[];

    // Screen 2: UI/UX data
    uiuxData?: UIUXData;
}

export interface Context {
    projectId: string;
    projectName: string;
    stage: Stage;
    driveFolderId: string;

    // Stage-specific data
    planningData?: PlanningData;
    implementationData?: any;

    // Artifacts
    artifacts: string[];
}
