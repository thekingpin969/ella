// uiuxHandler/mood.ts
// Mood selection phase for Screen 2

import { Context } from "../../types/context";
import { fsManager } from "../../../fs";
import { memoryService } from "../../../memory";
import { wsManager } from "../../../websocket/manager";
import { Mood, MOOD_OPTIONS, MoodOption } from "./types";
import { callLLMWithLogging, log, safeJSONParse } from "./utils";
import { getCachedUIUXStage, setCachedUIUXStage, UIUXCacheKey } from "./stageCache";
import { PROMPTS } from "../../prompts/prompts";

interface MoodRecommendation {
    recommended: Mood;
    reasoning: string;
    message: string;
    options: MoodOption[];
}

/**
 * Analyze project context and recommend a mood
 */
export async function analyzeMoodFromContext(context: Context): Promise<MoodRecommendation> {
    log('Analyzing project for mood recommendation...');

    // Check cache first
    const cached = getCachedUIUXStage<MoodRecommendation>(context, UIUXCacheKey.MOOD_RECOMMENDATION);
    if (cached) {
        log(`Using cached mood recommendation: ${cached.recommended}`);
        return cached;
    }

    // Load project artifacts
    const projectVision = await loadProjectVision(context);
    const prd = await loadPRD(context);
    const userPersonas = await loadUserPersonas(context);

    // Build context for LLM
    const analysisContext = buildMoodAnalysisContext(projectVision, prd, userPersonas);

    // Call LLM for mood recommendation
    const response = await callLLMWithLogging(
        context.projectId,
        'Mood Recommendation',
        [
            { role: 'system', content: PROMPTS.MOOD_RECOMMENDATION_PROMPT },
            { role: 'user', content: analysisContext }
        ],
        { temperature: 0.7, max_tokens: 1000 }
    );

    // Parse LLM response
    const result = safeJSONParse<{
        recommended: Mood;
        reasoning: string;
        alternatives: Mood[];
    }>(response.content, {
        recommended: 'minimal',
        reasoning: 'Default recommendation based on modern design trends.',
        alternatives: ['corporate', 'dark']
    });

    // Store in session memory
    memoryService.setSession(context.projectId, 'mood_recommendation', JSON.stringify(result));

    const recommendation: MoodRecommendation = {
        recommended: result.recommended,
        reasoning: result.reasoning,
        message: `Based on your project, I recommend a **${result.recommended}** design mood.\n\n*${result.reasoning}*\n\nYou can select this or choose a different mood below.`,
        options: MOOD_OPTIONS
    };

    // Cache the result
    setCachedUIUXStage(context, UIUXCacheKey.MOOD_RECOMMENDATION, recommendation);

    return recommendation;
}

/**
 * Handle user mood selection
 */
export async function handleMoodSelected(context: Context, selectedMood: Mood): Promise<void> {
    log(`Mood selected: ${selectedMood}`);

    if (!context.planningData?.uiuxData) {
        throw new Error('UIUXData not initialized');
    }

    // Update context
    context.planningData.uiuxData.mood = selectedMood;
    context.planningData.uiuxData.moodLocked = true;
    context.planningData.uiuxData.confidenceScore += 20; // Mood = 20%

    // Store in memory
    memoryService.setSession(context.projectId, 'selected_mood', JSON.stringify({
        mood: selectedMood,
        lockedAt: new Date().toISOString()
    }));

    // Get mood details
    const moodDetails = MOOD_OPTIONS.find(m => m.value === selectedMood);

    wsManager.sendMessage(context.projectId, {
        message: `✅ **Mood locked: ${moodDetails?.label || selectedMood}**\n\n${moodDetails?.description}\n\nNow let's find some UI inspirations that match this mood!`
    });
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

async function loadProjectVision(context: Context): Promise<string> {
    try {
        const content = await fsManager.readFile(context.projectId, 'docs/project-vision.md');
        return content || '';
    } catch {
        log('Could not load project-vision.md');
        return '';
    }
}

async function loadPRD(context: Context): Promise<string> {
    try {
        const content = await fsManager.readFile(context.projectId, 'docs/PRD.md');
        return content || '';
    } catch {
        log('Could not load PRD.md');
        return '';
    }
}

async function loadUserPersonas(context: Context): Promise<string> {
    try {
        const content = await fsManager.readFile(context.projectId, 'docs/user-personas.md');
        return content || '';
    } catch {
        log('Could not load user-personas.md');
        return '';
    }
}

function buildMoodAnalysisContext(vision: string, prd: string, personas: string): string {
    return `# Project Analysis for Mood Recommendation

## Project Vision
${vision || 'No project vision available.'}

## Product Requirements
${prd ? prd.substring(0, 3000) : 'No PRD available.'}

## User Personas
${personas || 'No user personas available.'}

---

Based on the above, recommend the most appropriate design mood for this project.`;
}


