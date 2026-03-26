// uiuxHandler/brandIdentity.ts
// Stage 1: Brand Identity generation — the strategic decision gate
// Answers "what is this product?" — archetype, personality, energy, trust, emotional journey

import { Context } from "../../types/context";
import { BrandIdentity, BrandIdentityFeedback, BrandArchetype } from "./types";
import { callLLMWithLogging, log, safeJSONParse } from "./utils";
import { getCachedUIUXStage, setCachedUIUXStage, UIUXCacheKey } from "./stageCache";
import { PROMPTS } from "../../prompts/prompts";
import { fsManager } from "../../../fs";

// Valid archetypes for validation
const VALID_ARCHETYPES: BrandArchetype[] = [
    'The Expert',
    'The Creator',
    'The Guide',
    'The Rebel',
    'The Companion',
    'The Innovator',
];

/**
 * Generate Brand Identity (Stage 1) — strategic/abstract output
 * Input: mood + PRD + project vision
 * Output: BrandIdentity — archetype, personality traits, energy, trust, visual feeling, emotional journey
 */
export async function generateBrandIdentity(context: Context): Promise<BrandIdentity> {
    log('[Brand Identity] Generating Brand Identity (Stage 1)...');

    // Check cache first
    const cached = getCachedUIUXStage<BrandIdentity>(context, UIUXCacheKey.BRAND_IDENTITY);
    if (cached) {
        log('[Brand Identity] Using cached Brand Identity');
        return cached;
    }

    const uiuxData = context.planningData?.uiuxData;
    if (!uiuxData?.mood) {
        throw new Error('Mood must be selected before generating Brand Identity');
    }

    // Load project documents
    const vision = await loadProjectVision(context);
    const prd = await loadPRD(context);
    const personas = await loadUserPersonas(context);

    const contextPrompt = buildBrandIdentityContext(uiuxData.mood, vision, prd, personas);

    const response = await callLLMWithLogging(
        context.projectId,
        'Generate Brand Identity',
        [
            { role: 'system', content: PROMPTS.BRAND_IDENTITY_PROMPT },
            { role: 'user', content: contextPrompt }
        ],
        { temperature: 0.7, max_tokens: 2000 }
    );

    const brandIdentity = safeJSONParse<BrandIdentity>(
        response.content,
        getDefaultBrandIdentity(uiuxData.mood)
    );

    // Validate and repair structure
    const validated = validateAndRepairBrandIdentity(brandIdentity, uiuxData.mood);

    // Cache result
    setCachedUIUXStage(context, UIUXCacheKey.BRAND_IDENTITY, validated);

    log('[Brand Identity] Brand Identity generated successfully');
    return validated;
}

/**
 * Handle user feedback and regenerate a specific aspect of Brand Identity
 */
export async function handleBrandIdentityFeedback(
    context: Context,
    feedback: BrandIdentityFeedback
): Promise<BrandIdentity> {
    log(`[Brand Identity] Processing feedback on aspect: ${feedback.aspect}`);

    const uiuxData = context.planningData?.uiuxData;
    if (!uiuxData?.brandIdentity) {
        throw new Error('No Brand Identity to refine');
    }

    const current = uiuxData.brandIdentity;

    const refinementPrompt = `# Brand Identity Refinement

## Current Brand Identity
\`\`\`json
${JSON.stringify(current, null, 2)}
\`\`\`

## User Feedback
Aspect to change: ${feedback.aspect}
Requested Change: ${feedback.change}

Regenerate the full Brand Identity JSON with this specific aspect updated.
Keep all other fields exactly as they are.
Ensure internal consistency is maintained:
- personality traits must still align with archetype
- energy level must not contradict visual feeling
- trust level implication must be consistent with market position
- emotional journey must reflect personality traits`;

    const response = await callLLMWithLogging(
        context.projectId,
        'Refine Brand Identity',
        [
            { role: 'system', content: PROMPTS.BRAND_IDENTITY_PROMPT },
            { role: 'user', content: refinementPrompt }
        ],
        { temperature: 0.6, max_tokens: 2000 }
    );

    const updated = safeJSONParse<BrandIdentity>(response.content, current);
    const validated = validateAndRepairBrandIdentity(updated, uiuxData.mood || 'minimal');

    // Update cache
    setCachedUIUXStage(context, UIUXCacheKey.BRAND_IDENTITY, validated);

    log('[Brand Identity] Brand Identity refined successfully');
    return validated;
}

/**
 * Lock Brand Identity and persist to project workspace
 */
export async function lockBrandIdentity(context: Context): Promise<void> {
    const uiuxData = context.planningData?.uiuxData;
    if (!uiuxData?.brandIdentity) {
        throw new Error('No Brand Identity to lock');
    }

    uiuxData.brandIdentityLocked = true;
    uiuxData.currentPhase = 'brand_dna';
    uiuxData.confidenceScore += 15; // Brand Identity = 15%

    log('[Brand Identity] Brand Identity locked — advancing to Brand DNA phase');

    // Persist to project workspace
    const bi = uiuxData.brandIdentity;
    try {
        // 1) Raw JSON — machine-readable
        await fsManager.writeFile(
            context.projectId,
            'design/brand-identity.json',
            JSON.stringify(bi, null, 2)
        );

        // 2) Markdown summary — human-readable
        const md = `# Brand Identity

## Archetype
${bi.archetype}

## Personality Traits
${bi.personalityTraits.map((t: string) => `- ${t}`).join('\n')}

## Visual Feeling
${bi.visualFeeling.map((v: string) => `- ${v}`).join('\n')}

## Energy Level
Score: ${bi.energyLevel.score}/10 — ${bi.energyLevel.description}

## Trust Level
Score: ${bi.trustLevel.score}/10 — ${bi.trustLevel.description}
Implication: ${bi.trustLevel.implication}

## Emotional Journey
- On Landing: ${bi.emotionalJourney.onLanding}
- During Core Action: ${bi.emotionalJourney.duringCoreAction}
- On Error: ${bi.emotionalJourney.onError}

## Market Position
- **What:** ${bi.marketPosition.what}
- **Who:** ${bi.marketPosition.who}
- **Problem:** ${bi.marketPosition.problem}
- **Differentiation:** ${bi.marketPosition.differentiation}

---
_Locked at ${new Date().toISOString()}_
`;
        await fsManager.writeFile(
            context.projectId,
            'design/brand-identity.md',
            md
        );

        log('[Brand Identity] Saved brand-identity.json + brand-identity.md to workspace');
    } catch (err: any) {
        log(`[Brand Identity] Warning: could not save to workspace — ${err.message}`);
    }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function buildBrandIdentityContext(
    mood: string,
    vision: string,
    prd: string,
    personas: string
): string {
    return `# Brand Identity Generation Request

## Selected Mood
${mood}

## Project Vision
${vision || 'No detailed vision available — use mood and general best practices.'}

## Product Requirements Document
${prd ? prd.substring(0, 3000) : 'No PRD available — use mood and vision to guide decisions.'}

## User Personas
${personas ? personas.substring(0, 1500) : 'No user personas available.'}

---

Analyze the above context and generate a complete Brand Identity JSON.
Your output must be ONLY the JSON object — no markdown, no explanation.`;
}

async function loadProjectVision(context: Context): Promise<string> {
    try {
        return await fsManager.readFile(context.projectId, 'docs/project-vision.md') || '';
    } catch {
        log('[Brand Identity] Could not load project-vision.md');
        return '';
    }
}

async function loadPRD(context: Context): Promise<string> {
    try {
        return await fsManager.readFile(context.projectId, 'docs/PRD.md') || '';
    } catch {
        log('[Brand Identity] Could not load PRD.md');
        return '';
    }
}

async function loadUserPersonas(context: Context): Promise<string> {
    try {
        return await fsManager.readFile(context.projectId, 'docs/user-personas.md') || '';
    } catch {
        log('[Brand Identity] Could not load user-personas.md');
        return '';
    }
}

/**
 * Validate brand identity structure and repair common issues
 */
function validateAndRepairBrandIdentity(identity: BrandIdentity, mood: string): BrandIdentity {
    const repaired = { ...identity };

    // Ensure archetype is valid
    if (!VALID_ARCHETYPES.includes(repaired.archetype)) {
        log(`[Brand Identity] Invalid archetype "${repaired.archetype}", defaulting to The Guide`);
        repaired.archetype = 'The Guide';
    }

    // Ensure personalityTraits is array of 3–5 items
    if (!Array.isArray(repaired.personalityTraits) || repaired.personalityTraits.length < 3) {
        log('[Brand Identity] personalityTraits invalid, using default');
        repaired.personalityTraits = ['Reliable', 'Clear', 'Focused'];
    }
    if (repaired.personalityTraits.length > 5) {
        repaired.personalityTraits = repaired.personalityTraits.slice(0, 5);
    }

    // Ensure visualFeeling is array of 3 items
    if (!Array.isArray(repaired.visualFeeling) || repaired.visualFeeling.length < 3) {
        log('[Brand Identity] visualFeeling invalid, using defaults');
        repaired.visualFeeling = ['Structured', 'Confident', 'Purposeful'];
    }
    if (repaired.visualFeeling.length > 3) {
        repaired.visualFeeling = repaired.visualFeeling.slice(0, 3);
    }

    // Ensure energy level score is in range 1–10
    if (!repaired.energyLevel || typeof repaired.energyLevel.score !== 'number') {
        repaired.energyLevel = { score: 5, description: 'Balanced energy' };
    }
    repaired.energyLevel.score = Math.max(1, Math.min(10, repaired.energyLevel.score));

    // Ensure trust level score is in range 1–10
    if (!repaired.trustLevel || typeof repaired.trustLevel.score !== 'number') {
        repaired.trustLevel = {
            score: 5,
            description: 'Moderate trust requirement',
            implication: 'Standard design conventions apply'
        };
    }
    repaired.trustLevel.score = Math.max(1, Math.min(10, repaired.trustLevel.score));

    // Ensure emotional journey fields exist
    if (!repaired.emotionalJourney) {
        repaired.emotionalJourney = {
            onLanding: 'Curious and intrigued',
            duringCoreAction: 'Focused and capable',
            onError: 'Confused but supported'
        };
    }

    // Ensure market position exists
    if (!repaired.marketPosition) {
        repaired.marketPosition = {
            what: 'A focused productivity tool',
            who: 'Professionals seeking efficiency',
            problem: 'Complexity slowing down work',
            differentiation: 'Simplicity without compromise'
        };
    }

    return repaired;
}

/**
 * Mood-based fallback defaults if LLM entirely fails
 */
function getDefaultBrandIdentity(mood: string): BrandIdentity {
    const defaults: Record<string, BrandIdentity> = {
        minimal: {
            marketPosition: {
                what: 'A clean, focused productivity tool',
                who: 'Professionals who value simplicity',
                problem: 'Cognitive overload from cluttered interfaces',
                differentiation: 'Radical simplicity without losing power'
            },
            personalityTraits: ['Precise', 'Calm', 'Trustworthy'],
            archetype: 'The Expert',
            energyLevel: { score: 3, description: 'Low, deliberate, calm' },
            visualFeeling: ['Spacious', 'Restrained', 'Purposeful'],
            trustLevel: { score: 6, description: 'Trust is central to adoption', implication: 'Use conservative design patterns — no gimmicks' },
            emotionalJourney: {
                onLanding: 'Immediately at ease with nothing in the way',
                duringCoreAction: 'Fully focused, no distractions',
                onError: 'Gently guided back without blame'
            }
        },
        dark: {
            marketPosition: {
                what: 'An immersive creative or developer workspace',
                who: 'Power users who live in their editor',
                problem: 'Eye strain and shallow interfaces breaking flow',
                differentiation: 'Built for sustained deep work sessions'
            },
            personalityTraits: ['Bold', 'Focused', 'Sleek'],
            archetype: 'The Innovator',
            energyLevel: { score: 5, description: 'Steady and immersive' },
            visualFeeling: ['Deep', 'Dramatic', 'Immersive'],
            trustLevel: { score: 5, description: 'Moderate trust through premium feel', implication: 'High contrast, clear hierarchy, no ambiguity' },
            emotionalJourney: {
                onLanding: 'Drawn in, intrigued by the depth',
                duringCoreAction: 'In flow state, everything else fades',
                onError: 'Sharp, clear error with immediate path forward'
            }
        },
        playful: {
            marketPosition: {
                what: 'A delightful consumer app that makes tasks fun',
                who: 'Everyday users who respond to personality',
                problem: 'Boring, forgettable apps users delete after one session',
                differentiation: 'Every interaction is a moment of joy'
            },
            personalityTraits: ['Energetic', 'Warm', 'Playful'],
            archetype: 'The Companion',
            energyLevel: { score: 8, description: 'High energy, bouncy, alive' },
            visualFeeling: ['Vibrant', 'Bouncy', 'Welcoming'],
            trustLevel: { score: 3, description: 'Low stakes — fun over formality', implication: 'Personality over convention, rounded shapes, expressive color' },
            emotionalJourney: {
                onLanding: 'Immediately delighted',
                duringCoreAction: 'Playful and engaged',
                onError: 'Gently humorous, never anxious'
            }
        }
    };

    return defaults[mood] || defaults['minimal'];
}
