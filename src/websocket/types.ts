export type WSMessagetType =
  | "update"
  | "question"
  | "artifact"
  | "error"
  | "stage_transition"
  | "typing"
  | "message"
  | "screen_complete"
  | "planning_complete";

export interface WSMessage {
  type: WSMessagetType;
  timestamp: string;
  data: any;
}

export interface WSUpdateData {
  message: string;
  progress?: number;
}

export interface WSQuestionData {
  questions: Array<{
    id: string;
    text: string;
    type: "text" | "choice" | "boolean";
    options?: string[];
  }>;
}

export interface WSArtifactData {
  path: string;
  artifactType: string;
  description: string;
}

export interface WSErrorData {
  message: string;
  code: string;
  recoverable: boolean;
}
