export type EventType =
  | "context_created"
  | "answers_provided"
  | "stage_changed"
  | "artifact_created";

export interface StageEvent {
  id: string;
  type: EventType;
  projectId: string;
  payload: any;
  timestamp: string;
}
