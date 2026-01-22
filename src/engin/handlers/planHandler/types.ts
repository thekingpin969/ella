// planHandler/types.ts
// Shared types for PlanHandler modules

import { Context } from "../../types/context";

// Result types
export interface ValidationResult {
    valid: boolean;
    message: string;
}

export interface AnalysisResult {
    gaps: string[];
    message: string;
}

export interface ConfidenceResult {
    confidence: number;
    reasoning: string;
}

export interface ProcessedAnswersResult {
    confidence: number;
    filledGaps: string[];
}

export interface GapFillingResult {
    filledGaps: Array<{ gap: string; resolution: string; source: string }>;
    unfillableGaps: string[];
}

export interface RecalculatedConfidence {
    confidence: number;
    reasoning: string;
    remainingGaps: string[];
}

export interface GapClassification {
    fillable: Array<{ gap: string; reason: string }>;
    unfillable: Array<{ gap: string; reason: string }>;
}

export interface FilledGap {
    gap: string;
    resolution: string;
    source: string;
}

export interface Artifact {
    path: string;
    content: string;
}

// Constants
export const MAX_CLARIFICATION_ROUNDS = 3;
export const CONFIDENCE_THRESHOLD = 95;
