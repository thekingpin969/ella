export interface ProjectMetadata {
  totalStories?: number;
  completedStories?: number;
  pendingQuestions?: number;
  [key: string]: any;
}

export interface DBProject {
  _id: string;
  description: string;
  stage: string;
  confidence: number;
  metadata: ProjectMetadata;
  created_at: Date;
  updated_at: Date;
}

export interface DBProjectFile {
  _id: string;
  project_id: string;
  name: string;
  content: string;
  type: string;
  created_at: Date;
}

export interface DBArtifact {
  _id: string;
  project_id: string;
  path: string;
  type: string;
  size: number;
  created_at: Date;
}
