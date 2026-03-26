// uiuxHandler/brandDNA.ts
// Stage 2: Brand DNA generation — the concrete design system gate
// Takes locked Brand Identity as input.
// Answers "how does this product look and behave?" with EXACT values only.
// Every output value is actionable: hex codes, px numbers, font names — no descriptions.

import { Context } from "../../types/context";
import { BrandDNAOutput, BrandDNAFeedback } from "./types";
import { callLLMWithLogging, log, safeJSONParse } from "./utils";
import { getCachedUIUXStage, setCachedUIUXStage, UIUXCacheKey } from "./stageCache";
import { PROMPTS } from "../../prompts/prompts";
import { fsManager } from "../../../fs";

// Valid hex color pattern
const HEX_PATTERN = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;

/**
 * Generate Brand DNA (Stage 2) — concrete/exact design values
 * Input: locked BrandIdentity from context
 * Output: BrandDNAOutput — exact hex colors, font names, px values, motion timings
 */
export async function generateBrandDNA(context: Context): Promise<BrandDNAOutput> {
    log('[Brand DNA] Generating Brand DNA (Stage 2)...');

    // Check cache first
    const cached = getCachedUIUXStage<BrandDNAOutput>(context, UIUXCacheKey.BRAND_DNA_OUTPUT);
    if (cached) {
        log('[Brand DNA] Using cached Brand DNA');
        return cached;
    }

    const uiuxData = context.planningData?.uiuxData;
    if (!uiuxData?.brandIdentity) {
        throw new Error('Brand Identity must be locked before generating Brand DNA');
    }

    if (!uiuxData.brandIdentityLocked) {
        throw new Error('Brand Identity must be locked before generating Brand DNA');
    }

    // Load PRD for additional context
    const prd = await loadPRD(context);

    const contextPrompt = buildBrandDNAContext(uiuxData.brandIdentity, uiuxData.mood || 'minimal', prd);

    const response = await callLLMWithLogging(
        context.projectId,
        'Generate Brand DNA',
        [
            { role: 'system', content: PROMPTS.BRAND_DNA_PROMPT },
            { role: 'user', content: contextPrompt }
        ],
        { temperature: 0.5, max_tokens: 2000 } // Lower temp = more precise values
    );

    const brandDNA = safeJSONParse<BrandDNAOutput>(
        response.content,
        getDefaultBrandDNA(uiuxData.brandIdentity)
    );

    // Validate and repair structure — ensure all values are exact
    const validated = validateAndRepairBrandDNA(brandDNA, uiuxData.brandIdentity);

    // Cache result
    setCachedUIUXStage(context, UIUXCacheKey.BRAND_DNA_OUTPUT, validated);

    log('[Brand DNA] Brand DNA generated successfully');
    return validated;
}

/**
 * Handle user feedback and regenerate a specific aspect of Brand DNA
 */
export async function handleBrandDNAFeedback(
    context: Context,
    feedback: BrandDNAFeedback
): Promise<BrandDNAOutput> {
    log(`[Brand DNA] Processing feedback on aspect: ${feedback.aspect}`);

    const uiuxData = context.planningData?.uiuxData;
    if (!uiuxData?.brandDNA) {
        throw new Error('No Brand DNA to refine');
    }
    if (!uiuxData?.brandIdentity) {
        throw new Error('Brand Identity is required for Brand DNA refinement');
    }

    const current = uiuxData.brandDNA;
    const identity = uiuxData.brandIdentity;

    const refinementPrompt = `# Brand DNA Refinement

## Brand Identity (Context — DO NOT change these)
\`\`\`json
${JSON.stringify(identity, null, 2)}
\`\`\`

## Current Brand DNA
\`\`\`json
${JSON.stringify(current, null, 2)}
\`\`\`

## User Feedback
Aspect to change: ${feedback.aspect}
Requested Change: ${feedback.change}

Regenerate the full Brand DNA JSON with this specific aspect updated.
Keep all other fields exactly as they are.
ALL values must remain exact (hex codes, px values, font names) — no descriptions.`;

    const response = await callLLMWithLogging(
        context.projectId,
        'Refine Brand DNA',
        [
            { role: 'system', content: PROMPTS.BRAND_DNA_PROMPT },
            { role: 'user', content: refinementPrompt }
        ],
        { temperature: 0.4, max_tokens: 2000 }
    );

    const updated = safeJSONParse<BrandDNAOutput>(response.content, current);
    const validated = validateAndRepairBrandDNA(updated, identity);

    // Update cache
    setCachedUIUXStage(context, UIUXCacheKey.BRAND_DNA_OUTPUT, validated);

    log('[Brand DNA] Brand DNA refined successfully');
    return validated;
}

/**
 * Lock Brand DNA and persist to project workspace
 */
export async function lockBrandDNA(context: Context): Promise<void> {
    const uiuxData = context.planningData?.uiuxData;
    if (!uiuxData?.brandDNA) {
        throw new Error('No Brand DNA to lock');
    }

    uiuxData.brandDNALocked = true;
    uiuxData.currentPhase = 'inspiration';
    uiuxData.confidenceScore += 15; // Brand DNA = 15%

    log('[Brand DNA] Brand DNA locked — advancing to Inspiration phase');

    // Persist to project workspace
    const dna = uiuxData.brandDNA;
    try {
        // 1) Raw JSON — machine-readable, used by screen generator
        await fsManager.writeFile(
            context.projectId,
            'design/brand-dna.json',
            JSON.stringify(dna, null, 2)
        );

        // 2) Markdown summary — human-readable
        const md = `# Brand DNA

## Colors (Mode: ${dna.color.mode})
| Role | Hex |
|------|-----|
| Primary | \`${dna.color.primary}\` |
| Secondary | \`${dna.color.secondary}\` |
| Accent | \`${dna.color.accent}\` |
| Background | \`${dna.color.background}\` |
| Surface | \`${dna.color.surface}\` |
| Text Primary | \`${dna.color.text.primary}\` |
| Text Secondary | \`${dna.color.text.secondary}\` |
| Text Disabled | \`${dna.color.text.disabled}\` |
| Text Inverse | \`${dna.color.text.inverse}\` |
| Error | \`${dna.color.semantic.error}\` |
| Success | \`${dna.color.semantic.success}\` |
| Warning | \`${dna.color.semantic.warning}\` |

## Typography
- **Primary Font:** ${dna.typography.primary}
- **Secondary Font:** ${dna.typography.secondary}
- **Weight Range:** ${dna.typography.weightRange}
- **Size Direction:** ${dna.typography.sizeDirection}

## Shape
- **Border Radius Style:** ${dna.shape.borderRadius} (${dna.shape.borderRadiusValue})
- **Consistency:** ${dna.shape.consistency}

## Spacing
- **Density:** ${dna.spacing.density}
- **Base Unit:** ${dna.spacing.baseUnit}

## Elevation
- **Shadow Style:** ${dna.elevation.shadowStyle}
- **Border Usage:** ${dna.elevation.borderUsage}

## Iconography
- **Style:** ${dna.iconography.style}
- **Family:** ${dna.iconography.family}

## Motion
- **Fast:** ${dna.motion.durationFast}
- **Normal:** ${dna.motion.durationNormal}
- **Slow:** ${dna.motion.durationSlow}
- **Easing:** \`${dna.motion.easing}\`

## Voice
- **Tone:** ${dna.voice.tone}
- **Rules:**
${dna.voice.rules.map((r: string) => `  - ${r}`).join('\n')}

---
_Locked at ${new Date().toISOString()}_
`;
        await fsManager.writeFile(
            context.projectId,
            'design/brand-dna.md',
            md
        );

        log('[Brand DNA] Saved brand-dna.json + brand-dna.md to workspace');
    } catch (err: any) {
        log(`[Brand DNA] Warning: could not save to workspace — ${err.message}`);
    }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function buildBrandDNAContext(brandIdentity: any, mood: string, prd: string): string {
    return `# Brand DNA Generation Request

## Brand Identity (the strategic foundation — derive all values from this)
\`\`\`json
${JSON.stringify(brandIdentity, null, 2)}
\`\`\`

## Selected Mood
${mood}

## Product Requirements (for additional context)
${prd ? prd.substring(0, 1500) : 'Not available.'}

---

Using the Brand Identity above as your sole source of truth, generate the Brand DNA JSON.
Rules:
- EVERY color value must be an exact hex code like #1A1A2E — no color names
- EVERY font name must be a real, widely available Google Font or system font
- EVERY size value must be a pixel value like 6px or 4px
- Motion values must be exact ms values and cubic-bezier strings
- voice.rules must be 3 concrete, actionable writing rules (not abstract statements)
- Derive ALL decisions from the brand identity: visualFeeling, energyLevel.score, trustLevel.score, archetype, personalityTraits

Your output must be ONLY the JSON object — no markdown, no explanation.`;
}

async function loadPRD(context: Context): Promise<string> {
    try {
        return await fsManager.readFile(context.projectId, 'docs/PRD.md') || '';
    } catch {
        log('[Brand DNA] Could not load PRD.md');
        return '';
    }
}

/**
 * Validate all Brand DNA values are exact (hex codes, px values, font names)
 * Repair any missing or invalid values using intelligent defaults
 */
function validateAndRepairBrandDNA(dna: BrandDNAOutput, identity: any): BrandDNAOutput {
    const repaired = JSON.parse(JSON.stringify(dna)) as BrandDNAOutput; // deep clone

    // --- Color validation ---
    if (!repaired.color) repaired.color = getDefaultColors(identity);
    const colorDefaults = getDefaultColors(identity);

    const validateHex = (val: string, fallback: string): string =>
        HEX_PATTERN.test(val) ? val.toUpperCase() : fallback;

    repaired.color.primary = validateHex(repaired.color?.primary, colorDefaults.primary);
    repaired.color.secondary = validateHex(repaired.color?.secondary, colorDefaults.secondary);
    repaired.color.accent = validateHex(repaired.color?.accent, colorDefaults.accent);
    repaired.color.background = validateHex(repaired.color?.background, colorDefaults.background);
    repaired.color.surface = validateHex(repaired.color?.surface, colorDefaults.surface);

    if (!repaired.color.text) repaired.color.text = colorDefaults.text;
    repaired.color.text.primary = validateHex(repaired.color.text?.primary, colorDefaults.text.primary);
    repaired.color.text.secondary = validateHex(repaired.color.text?.secondary, colorDefaults.text.secondary);
    repaired.color.text.disabled = validateHex(repaired.color.text?.disabled, colorDefaults.text.disabled);
    repaired.color.text.inverse = validateHex(repaired.color.text?.inverse, colorDefaults.text.inverse);

    if (!repaired.color.semantic) repaired.color.semantic = colorDefaults.semantic;
    repaired.color.semantic.error = validateHex(repaired.color.semantic?.error, '#EF4444');
    repaired.color.semantic.success = validateHex(repaired.color.semantic?.success, '#22C55E');
    repaired.color.semantic.warning = validateHex(repaired.color.semantic?.warning, '#F59E0B');

    const validModes = ['light', 'dark', 'both'] as const;
    if (!validModes.includes(repaired.color?.mode as any)) {
        // Derive from identity trust level and visual feeling
        const trustScore = identity?.trustLevel?.score ?? 5;
        repaired.color.mode = trustScore >= 7 ? 'light' : 'dark';
    }

    // --- Typography validation ---
    if (!repaired.typography) {
        repaired.typography = {
            primary: 'Inter',
            secondary: 'none',
            weightRange: '400–700 only',
            sizeDirection: 'balanced'
        };
    }
    if (!repaired.typography.primary || repaired.typography.primary.length < 2) {
        repaired.typography.primary = 'Inter';
    }
    if (!repaired.typography.secondary) repaired.typography.secondary = 'none';
    if (!repaired.typography.weightRange) repaired.typography.weightRange = '400–700 only';
    const validSizeDirections = ['compact', 'balanced', 'generous'] as const;
    if (!validSizeDirections.includes(repaired.typography?.sizeDirection as any)) {
        repaired.typography.sizeDirection = 'balanced';
    }

    // --- Shape validation ---
    if (!repaired.shape) {
        repaired.shape = { borderRadius: 'soft', borderRadiusValue: '6px', consistency: 'consistent' };
    }
    const validBorderRadius = ['sharp', 'soft', 'rounded', 'pill'] as const;
    if (!validBorderRadius.includes(repaired.shape?.borderRadius as any)) {
        repaired.shape.borderRadius = 'soft';
    }
    if (!repaired.shape.borderRadiusValue || !repaired.shape.borderRadiusValue.includes('px')) {
        const radiusMap = { sharp: '0px', soft: '6px', rounded: '12px', pill: '9999px' };
        repaired.shape.borderRadiusValue = radiusMap[repaired.shape.borderRadius];
    }
    if (!['consistent', 'varied'].includes(repaired.shape?.consistency)) {
        repaired.shape.consistency = 'consistent';
    }

    // --- Spacing validation ---
    if (!repaired.spacing) {
        repaired.spacing = { density: 'balanced', baseUnit: '4px' };
    }
    const validDensities = ['compact', 'balanced', 'airy'] as const;
    if (!validDensities.includes(repaired.spacing?.density as any)) {
        repaired.spacing.density = 'balanced';
    }
    if (!repaired.spacing.baseUnit || !repaired.spacing.baseUnit.includes('px')) {
        repaired.spacing.baseUnit = '4px';
    }

    // --- Elevation validation ---
    if (!repaired.elevation) {
        repaired.elevation = { shadowStyle: 'subtle', borderUsage: 'inputs only' };
    }
    const validShadows = ['flat', 'subtle', 'elevated', 'neumorphic'] as const;
    if (!validShadows.includes(repaired.elevation?.shadowStyle as any)) {
        repaired.elevation.shadowStyle = 'subtle';
    }
    if (!repaired.elevation.borderUsage) {
        repaired.elevation.borderUsage = 'inputs only, no card borders';
    }

    // --- Iconography validation ---
    if (!repaired.iconography) {
        repaired.iconography = { style: 'outlined', family: 'Lucide' };
    }
    const validIconStyles = ['outlined', 'filled', 'duotone', 'sharp'] as const;
    if (!validIconStyles.includes(repaired.iconography?.style as any)) {
        repaired.iconography.style = 'outlined';
    }
    if (!repaired.iconography.family) repaired.iconography.family = 'Lucide';

    // --- Motion validation ---
    if (!repaired.motion) {
        repaired.motion = {
            durationFast: '150ms',
            durationNormal: '250ms',
            durationSlow: '400ms',
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
        };
    }
    if (!repaired.motion.durationFast?.includes('ms')) repaired.motion.durationFast = '150ms';
    if (!repaired.motion.durationNormal?.includes('ms')) repaired.motion.durationNormal = '250ms';
    if (!repaired.motion.durationSlow?.includes('ms')) repaired.motion.durationSlow = '400ms';
    if (!repaired.motion.easing) repaired.motion.easing = 'cubic-bezier(0.4, 0, 0.2, 1)';

    // --- Voice validation ---
    if (!repaired.voice) {
        repaired.voice = { tone: 'friendly', rules: [] };
    }
    const validTones = ['direct', 'friendly', 'technical', 'inspirational'] as const;
    if (!validTones.includes(repaired.voice?.tone as any)) {
        repaired.voice.tone = 'friendly';
    }
    if (!Array.isArray(repaired.voice.rules) || repaired.voice.rules.length < 3) {
        repaired.voice.rules = [
            'Use active voice and short sentences',
            'Lead with the user\'s action, not the system\'s state',
            'Never use jargon without immediate context'
        ];
    }

    return repaired;
}

/**
 * Generate default hex colors based on Brand Identity signals
 */
function getDefaultColors(identity: any): BrandDNAOutput['color'] {
    const archetype = identity?.archetype || 'The Guide';
    const trustScore = identity?.trustLevel?.score ?? 5;
    const energyScore = identity?.energyLevel?.score ?? 5;

    // Derive sensible defaults based on identity signals
    const isDark = trustScore < 5 || energyScore > 7;
    const isHighTrust = trustScore >= 7;

    const colorProfiles: Record<string, BrandDNAOutput['color']> = {
        'The Expert': {
            primary: '#1E3A5F', secondary: '#3B82F6', accent: '#2563EB', background: '#FFFFFF',
            surface: '#F8FAFC', text: { primary: '#1E293B', secondary: '#64748B', disabled: '#CBD5E1', inverse: '#F8FAFC' }, semantic: { error: '#DC2626', success: '#16A34A', warning: '#D97706' },
            mode: 'light'
        },
        'The Creator': {
            primary: '#7C3AED', secondary: '#EC4899', accent: '#F59E0B', background: '#FAFAF8',
            surface: '#FFFFFF', text: { primary: '#18181B', secondary: '#71717A', disabled: '#D4D4D8', inverse: '#FAFAF8' }, semantic: { error: '#EF4444', success: '#10B981', warning: '#F59E0B' },
            mode: 'light'
        },
        'The Guide': {
            primary: '#0F766E', secondary: '#14B8A6', accent: '#0D9488', background: '#FFFFFF',
            surface: '#F0FDFA', text: { primary: '#134E4A', secondary: '#0F766E', disabled: '#99F6E4', inverse: '#FFFFFF' }, semantic: { error: '#DC2626', success: '#059669', warning: '#D97706' },
            mode: 'light'
        },
        'The Rebel': {
            primary: '#0F0F0F', secondary: '#F97316', accent: '#EF4444', background: '#0A0A0A',
            surface: '#1A1A1A', text: { primary: '#FAFAFA', secondary: '#A1A1AA', disabled: '#52525B', inverse: '#0A0A0A' }, semantic: { error: '#EF4444', success: '#22C55E', warning: '#EAB308' },
            mode: 'dark'
        },
        'The Companion': {
            primary: '#EC4899', secondary: '#F472B6', accent: '#8B5CF6', background: '#FFF7F7',
            surface: '#FFFFFF', text: { primary: '#831843', secondary: '#F472B6', disabled: '#FBCFE8', inverse: '#FFFFFF' }, semantic: { error: '#DC2626', success: '#10B981', warning: '#F59E0B' },
            mode: 'light'
        },
        'The Innovator': {
            primary: '#1A1A2E', secondary: '#38BDF8', accent: '#7C3AED', background: '#0D0D1A',
            surface: '#16213E', text: { primary: '#F1F5F9', secondary: '#94A3B8', disabled: '#475569', inverse: '#0D0D1A' }, semantic: { error: '#FC3D57', success: '#00D26A', warning: '#FFCA28' },
            mode: 'dark'
        }
    };

    return colorProfiles[archetype] || colorProfiles['The Guide'];
}

/**
 * Full fallback Brand DNA based on Brand Identity if LLM entirely fails
 */
function getDefaultBrandDNA(identity: any): BrandDNAOutput {
    const archetype = identity?.archetype || 'The Guide';
    const energyScore = identity?.energyLevel?.score ?? 5;
    const trustScore = identity?.trustLevel?.score ?? 5;
    const colors = getDefaultColors(identity);

    // Derive border radius from personality traits
    const personalityTraits: string[] = identity?.personalityTraits || [];
    const isPlayful = personalityTraits.some(t => /play|fun|energet|vibrant/i.test(t));
    const isPrecise = personalityTraits.some(t => /precis|expert|analyt|technic/i.test(t));
    const borderRadius = isPlayful ? 'rounded' : isPrecise ? 'sharp' : 'soft';
    const borderRadiusMap = { sharp: '0px', soft: '6px', rounded: '12px', pill: '9999px' };

    return {
        color: colors,
        typography: {
            primary: archetype === 'The Expert' ? 'Inter' : archetype === 'The Creator' ? 'DM Sans' : 'Inter',
            secondary: 'none',
            weightRange: energyScore > 7 ? '400–800 only' : '400–600 only',
            sizeDirection: energyScore < 4 ? 'compact' : energyScore > 7 ? 'generous' : 'balanced'
        },
        shape: {
            borderRadius,
            borderRadiusValue: borderRadiusMap[borderRadius],
            consistency: 'consistent'
        },
        spacing: {
            density: energyScore > 7 ? 'airy' : trustScore >= 7 ? 'balanced' : 'balanced',
            baseUnit: '4px'
        },
        elevation: {
            shadowStyle: trustScore >= 7 ? 'flat' : 'subtle',
            borderUsage: 'inputs and dividers only, no card borders'
        },
        iconography: {
            style: isPlayful ? 'filled' : isPrecise ? 'sharp' : 'outlined',
            family: 'Lucide'
        },
        motion: {
            durationFast: energyScore > 7 ? '100ms' : '150ms',
            durationNormal: energyScore > 7 ? '200ms' : '250ms',
            durationSlow: energyScore > 7 ? '300ms' : '400ms',
            easing: isPlayful ? 'cubic-bezier(0.34, 1.56, 0.64, 1)' : 'cubic-bezier(0.4, 0, 0.2, 1)'
        },
        voice: {
            tone: trustScore >= 7 ? 'direct' : energyScore > 7 ? 'friendly' : 'friendly',
            rules: [
                'Use active voice — "Save your work" not "Your work is being saved"',
                'Lead with the outcome, not the process',
                'Error messages must include a recovery action'
            ]
        }
    };
}
