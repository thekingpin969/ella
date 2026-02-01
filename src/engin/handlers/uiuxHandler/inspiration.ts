// uiuxHandler/inspiration.ts
// Inspiration gallery phase for Screen 2

import { Context } from "../../types/context";
import { memoryService } from "../../../memory";
import { wsManager } from "../../../websocket/manager";
import {
    InspirationItem,
    InspirationRating,
    TasteAnalysis,
    generateInspirationId
} from "./types";
import { callLLMWithLogging, log, safeJSONParse } from "./utils";
import { getCachedUIUXStage, setCachedUIUXStage, UIUXCacheKey } from "./stageCache";

interface InspirationRatingInput {
    id: string;
    rating: InspirationRating;
}

/**
 * Search for UI inspirations based on mood and project type
 */
export async function searchInspirations(context: Context): Promise<InspirationItem[]> {
    log('Searching for UI inspirations...');

    // Check cache first
    const cached = getCachedUIUXStage<InspirationItem[]>(context, UIUXCacheKey.INSPIRATIONS);
    if (cached) {
        log(`Using cached inspirations (${cached.length} items)`);
        const uiuxData = context.planningData?.uiuxData;
        if (uiuxData) {
            uiuxData.inspirations = cached;
        }
        return cached;
    }

    const uiuxData = context.planningData?.uiuxData;
    if (!uiuxData) {
        throw new Error('UIUXData not initialized');
    }

    const mood = uiuxData.mood || 'minimal';

    // Load project vision for context
    const visionStr = memoryService.getSession(context.projectId, 'initial_analysis');
    let projectContext = 'web application';
    if (visionStr) {
        try {
            const parsed = JSON.parse(visionStr.content);
            projectContext = parsed.description || 'web application';
        } catch {
            // Use default
        }
    }

    // Generate inspirations via LLM (since we don't have real API access)
    const response = await callLLMWithLogging(
        context.projectId,
        'Generate UI Inspirations',
        [
            { role: 'system', content: INSPIRATION_GENERATION_PROMPT },
            { role: 'user', content: `Mood: ${mood}\nProject: ${projectContext}` }
        ],
        { temperature: 0.8, max_tokens: 2000 }
    );

    const parsed = safeJSONParse<{ inspirations: any[] }>(response.content, { inspirations: [] });

    // Transform to InspirationItem format with generated IDs
    const inspirations: InspirationItem[] = parsed.inspirations.map((item, index) => ({
        id: generateInspirationId(),
        source: item.source || 'generated',
        url: item.url,
        thumbnailUrl: item.thumbnailUrl,
        title: item.title || `Inspiration ${index + 1}`,
        description: item.description || '',
        tags: item.tags || [mood]
    }));

    // Store in context
    uiuxData.inspirations = inspirations;

    // Cache the result
    setCachedUIUXStage(context, UIUXCacheKey.INSPIRATIONS, inspirations);

    // Store in session memory
    memoryService.setSession(context.projectId, 'inspirations', JSON.stringify(inspirations));

    log(`Generated ${inspirations.length} inspirations`);
    return inspirations;
}

/**
 * Process user ratings of inspirations
 */
export async function handleInspirationsRated(
    context: Context,
    ratings: InspirationRatingInput[]
): Promise<void> {
    log(`Processing ${ratings.length} inspiration ratings`);

    const uiuxData = context.planningData?.uiuxData;
    if (!uiuxData) {
        throw new Error('UIUXData not initialized');
    }

    // Update inspiration ratings
    for (const rating of ratings) {
        const inspiration = uiuxData.inspirations.find(i => i.id === rating.id);
        if (inspiration) {
            inspiration.userRating = rating.rating;
        }
    }

    // Mark inspiration phase as locked
    uiuxData.inspirationLocked = true;
    uiuxData.confidenceScore += 20; // Inspiration = 20%

    // Analyze taste patterns
    const tasteAnalysis = await analyzeTastePatterns(context);
    uiuxData.tasteAnalysis = tasteAnalysis;

    // Store in memory
    memoryService.setSession(context.projectId, 'taste_analysis', JSON.stringify(tasteAnalysis));

    // Send taste analysis to client
    wsManager.broadcast(context.projectId, {
        type: "taste_analysis",
        timestamp: new Date().toISOString(),
        data: {
            message: `🎨 **I noticed some patterns in your preferences:**\n\n${tasteAnalysis.designSignature}`,
            preferences: tasteAnalysis.preferences
        }
    });
}

/**
 * Analyze user's taste patterns from ratings
 */
async function analyzeTastePatterns(context: Context): Promise<TasteAnalysis> {
    log('Analyzing taste patterns...');

    // Check cache first
    const cached = getCachedUIUXStage<TasteAnalysis>(context, UIUXCacheKey.TASTE_ANALYSIS);
    if (cached) {
        log(`Using cached taste analysis`);
        return cached;
    }

    const uiuxData = context.planningData?.uiuxData;
    if (!uiuxData) {
        return getDefaultTasteAnalysis();
    }

    const favorites = uiuxData.inspirations.filter(i => i.userRating === 'favorite');
    const rejected = uiuxData.inspirations.filter(i => i.userRating === 'rejected');

    if (favorites.length === 0 && rejected.length === 0) {
        return getDefaultTasteAnalysis();
    }

    // Build analysis context
    const analysisContext = `
## Favorited Inspirations
${favorites.map(f => `- ${f.title}: ${f.description} (tags: ${f.tags.join(', ')})`).join('\n') || 'None'}

## Rejected Inspirations
${rejected.map(r => `- ${r.title}: ${r.description} (tags: ${r.tags.join(', ')})`).join('\n') || 'None'}

## Selected Mood
${uiuxData.mood}
`;

    const response = await callLLMWithLogging(
        context.projectId,
        'Analyze Taste Patterns',
        [
            { role: 'system', content: TASTE_ANALYSIS_PROMPT },
            { role: 'user', content: analysisContext }
        ],
        { temperature: 0.6, max_tokens: 1000 }
    );

    const result = safeJSONParse<TasteAnalysis>(response.content, getDefaultTasteAnalysis());

    // Cache the result
    setCachedUIUXStage(context, UIUXCacheKey.TASTE_ANALYSIS, result);

    log(`Taste analysis complete: ${result.designSignature.substring(0, 50)}...`);
    return result;
}

function getDefaultTasteAnalysis(): TasteAnalysis {
    return {
        designSignature: "You prefer clean, modern designs with balanced spacing and subtle interactions.",
        preferences: {
            whitespace: 'moderate',
            corners: 'rounded',
            colorStyle: 'muted',
            density: 'balanced',
            animations: 'subtle'
        }
    };
}

// ==========================================
// PROMPTS
// ==========================================

const INSPIRATION_GENERATION_PROMPT = `You are E.L.L.A's UI/UX design expert. Generate 6-8 UI inspiration descriptions for the given mood and project type.

For each inspiration, create a realistic description of what a designer would find on Dribbble or Behance.

## Response Format
Respond with ONLY valid JSON:
{
    "inspirations": [
        {
            "source": "dribbble",
            "title": "Clean Dashboard UI",
            "description": "Modern analytics dashboard with card-based layout, subtle shadows, and a pastel color palette. Features elegant data visualizations and clean typography.",
            "tags": ["dashboard", "minimal", "cards", "analytics"],
            "thumbnailUrl": null
        },
        ...
    ]
}

Generate inspirations that:
1. Match the specified mood
2. Are relevant to the project type
3. Represent variety in layout and approach
4. Include specific visual details (colors, shapes, interactions)`;

const TASTE_ANALYSIS_PROMPT = `You are E.L.L.A's UI/UX design expert. Analyze the user's preferences based on what they favorited and rejected.

## Response Format
Respond with ONLY valid JSON:
{
    "designSignature": "<A conversational 2-3 sentence description of their taste, e.g. 'You prefer clean, minimal interfaces with generous whitespace. Strong contrast and bold typography catch your eye, while cluttered layouts don't appeal to you.'>",
    "preferences": {
        "whitespace": "minimal" | "moderate" | "generous",
        "corners": "sharp" | "slightly-rounded" | "rounded" | "pill",
        "colorStyle": "vibrant" | "muted" | "monochrome" | "gradient",
        "density": "compact" | "balanced" | "spacious",
        "animations": "none" | "subtle" | "moderate" | "dynamic"
    }
}

Analyze patterns:
- What visual elements appear in favorites but not rejected?
- What layouts do they prefer?
- What color styles attract them?
- How much information density do they like?`;
