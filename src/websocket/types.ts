export type WSMessagetType =
  | "update"
  | "question"
  | "artifact"
  | "error"
  | "stage_transition"
  | "typing"
  | "message"
  | "screen_complete"
  | "planning_complete"
  // Screen 2: UI/UX message types
  | "mood_selection"
  | "brand_identity_generated"
  | "brand_identity_updated"
  | "brand_dna_generated"
  | "brand_dna_updated"
  | "inspiration_gallery"
  | "taste_analysis"
  | "screen_preview"
  | "screen_preview_single"
  | "screen_preview_complete"
  | "screen_preview_loading"
  | "variant_slot_reserved"
  | "variant_chat_response"
  | "variant_updated"
  | "variant_generation_progress"
  | "prototype_ready"
  | "screen2_complete"
  | "log";

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
