export interface APIError {
  error: {
    message: string;
    code: string;
    timestamp: string;
    recoverable?: boolean;
  };
}

export interface CreateProjectRequest {
  description: string;
  files?: {
    name: string;
    content: string;
    type: string;
  }[];
}

export interface CreateProjectResponse {
  projectId: string;
  status: "created";
  currentStage: string;
  createdAt: string;
}

export interface ProjectResponse {
  projectId: string;
  stage: string;
  confidence: number;
  artifacts: string[];
  createdAt: string;
  updatedAt: string;
  metadata: {
    totalStories?: number;
    completedStories?: number;
    pendingQuestions?: number;
  };
}

export interface AnswerRequest {
  answers: Record<string, any>;
}

export interface AnswerResponse {
  success: boolean;
  updatedConfidence: number;
  nextAction: "waiting" | "questions_needed" | "ready_to_plan";
}

export interface ArtifactListResponse {
  artifacts: Array<{
    path: string;
    type: string;
    size: number;
    createdAt: string;
  }>;
}
