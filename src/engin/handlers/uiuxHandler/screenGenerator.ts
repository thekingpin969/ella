// uiuxHandler/screenGenerator.ts
// Screen generation phase for Screen 2

import { Context } from "../../types/context";
import { fsManager } from "../../../fs";
import { memoryService } from "../../../memory";
import { wsManager } from "../../../websocket/manager";
import {
    KeyScreen,
    ScreenVariant,
    ScreenFeedback,
    ScreenType,
    DeviceScreens,
    generateScreenVariantId
} from "./types";
import { callLLMWithLogging, log, safeJSONParse, cleanHTML, cleanCSS } from "./utils";
import { getCachedUIUXStage, setCachedUIUXStage, UIUXCacheKey } from "./stageCache";
import { PROMPTS } from "../../prompts/prompts";

interface ScreenFeedbackResult {
    needsRegeneration: boolean;
    moveToNext: boolean;
}

/**
 * Identify key screens from PRD
 */
export async function identifyKeyScreens(context: Context): Promise<KeyScreen[]> {
    log('Identifying key screens from PRD...');

    // Check cache first
    const cached = getCachedUIUXStage<KeyScreen[]>(context, UIUXCacheKey.KEY_SCREENS);
    if (cached) {
        log(`Using cached key screens (${cached.length} screens)`);
        return cached;
    }

    // Load PRD
    let prdContent = '';
    try {
        prdContent = await fsManager.readFile(context.projectId, 'docs/PRD.md') || '';
    } catch {
        log('Could not load PRD, using project vision');
    }

    // Fallback to project vision
    if (!prdContent) {
        try {
            prdContent = await fsManager.readFile(context.projectId, 'docs/project-vision.md') || '';
        } catch {
            prdContent = 'Generic web application';
        }
    }

    const response = await callLLMWithLogging(
        context.projectId,
        'Identify Key Screens',
        [
            { role: 'system', content: PROMPTS.KEY_SCREENS_PROMPT },
            { role: 'user', content: prdContent.substring(0, 4000) }
        ],
        { temperature: 0.6, max_tokens: 1500 }
    );

    const result = safeJSONParse<{ screens: KeyScreen[] }>(response.content, {
        screens: getDefaultScreens()
    });

    // Ensure we have at least some screens
    if (result.screens.length === 0) {
        return getDefaultScreens();
    }

    // Limit to max 5 screens for faster iteration
    const screens = result.screens.slice(0, 5);

    // Cache the result
    setCachedUIUXStage(context, UIUXCacheKey.KEY_SCREENS, screens);

    log(`Identified ${screens.length} key screens`);
    return screens;
}

/**
 * Generate a SINGLE variant for a screen with responsive designs for all devices
 * This is the atomic unit for parallel generation
 */
export async function generateSingleVariant(
    context: Context,
    screen: KeyScreen,
    variantLabel: 'A' | 'B' | 'C',
    feedbackHint?: string
): Promise<ScreenVariant> {
    log(`Generating ${screen.name} variant ${variantLabel} for all devices...`);
    wsManager.sendLog(context.projectId, `Generating ${screen.name} variant ${variantLabel} (mobile, tablet, PC)...`);

    const uiuxData = context.planningData?.uiuxData;
    if (!uiuxData) {
        throw new Error('UIUXData not initialized');
    }

    const generationContext = buildGenerationContext(context, screen, feedbackHint);

    const response = await callLLMWithLogging(
        context.projectId,
        `Generate ${screen.name} Variant ${variantLabel}`,
        [
            { role: 'system', content: PROMPTS.SCREEN_GENERATION_PROMPT },
            { role: 'user', content: `${generationContext}\n\nGenerate VARIANT ${variantLabel}.\n${getVariantHint(variantLabel)}` }
        ],
        { temperature: 0.8, max_tokens: 8000 }  // Increased tokens for 3 device designs
    );

    const parsed = safeJSONParse<{
        mobile: { html: string; css: string };
        tablet: { html: string; css: string };
        pc: { html: string; css: string };
        description: string;
    }>(response.content, {
        mobile: { html: getFallbackHTML(screen.name, variantLabel, 'mobile'), css: getFallbackCSS() },
        tablet: { html: getFallbackHTML(screen.name, variantLabel, 'tablet'), css: getFallbackCSS() },
        pc: { html: getFallbackHTML(screen.name, variantLabel, 'pc'), css: getFallbackCSS() },
        description: `Variant ${variantLabel} for ${screen.name}`
    });

    // Build device-specific screens
    const deviceScreens: DeviceScreens = {
        mobile: {
            htmlContent: cleanHTML(parsed.mobile.html),
            cssContent: cleanCSS(parsed.mobile.css)
        },
        tablet: {
            htmlContent: cleanHTML(parsed.tablet.html),
            cssContent: cleanCSS(parsed.tablet.css)
        },
        pc: {
            htmlContent: cleanHTML(parsed.pc.html),
            cssContent: cleanCSS(parsed.pc.css)
        }
    };

    return {
        id: generateScreenVariantId(),
        screenType: screen.type,
        screenName: screen.name,
        variant: variantLabel,
        // Keep mobile as the primary/legacy content for backward compatibility
        htmlContent: deviceScreens.mobile.htmlContent,
        cssContent: deviceScreens.mobile.cssContent,
        // New responsive device screens
        deviceScreens,
        description: parsed.description,
        status: 'pending'
    };
}

/**
 * Generate ALL variants for ALL screens in TRUE PARALLEL
 * Example: 5 screens × 3 variants = 15 parallel LLM calls
 */
export async function generateAllVariantsParallel(
    context: Context,
    screens: KeyScreen[],
    feedbackHint?: string
): Promise<ScreenVariant[]> {
    // Check cache first (only when no feedbackHint, meaning fresh generation)
    if (!feedbackHint) {
        const cached = getCachedUIUXStage<ScreenVariant[]>(context, UIUXCacheKey.SCREEN_VARIANTS);
        if (cached && cached.length > 0) {
            log(`Using cached screen variants (${cached.length} variants)`);
            wsManager.sendLog(context.projectId, `✅ Using cached screen variants (${cached.length} variants)`);
            return cached;
        }
    }

    const totalVariants = screens.length * 3;
    log(`Starting TRUE parallel generation: ${screens.length} screens × 3 variants = ${totalVariants} parallel calls`);
    wsManager.sendLog(context.projectId, `⚡ Generating ${totalVariants} variants in parallel...`);

    // Flatten all screen+variant combinations
    const allTasks: Array<{ screen: KeyScreen; variant: 'A' | 'B' | 'C'; index: number }> = [];
    screens.forEach((screen, screenIndex) => {
        (['A', 'B', 'C'] as const).forEach((variant) => {
            allTasks.push({ screen, variant, index: screenIndex });
        });
    });

    // Execute ALL in parallel
    const results = await Promise.all(
        allTasks.map(async (task) => {
            try {
                const variant = await generateSingleVariant(context, task.screen, task.variant, feedbackHint);
                return { success: true, variant, screenIndex: task.index };
            } catch (error: any) {
                log(`Error generating ${task.screen.name} ${task.variant}: ${error.message}`);
                return { success: false, variant: null, screenIndex: task.index, error: error.message };
            }
        })
    );

    // Collect successful variants
    const variants = results
        .filter((r): r is { success: true; variant: ScreenVariant; screenIndex: number } => r.success && r.variant !== null)
        .map(r => r.variant);

    // Cache the results (only when no feedbackHint)
    if (!feedbackHint && variants.length > 0) {
        setCachedUIUXStage(context, UIUXCacheKey.SCREEN_VARIANTS, variants);
    }

    log(`Parallel generation complete: ${variants.length}/${totalVariants} variants generated`);
    return variants;
}

/**
 * Generate 3 screen variants (A, B, C) - LEGACY sequential version
 * Kept for regeneration with feedback on a single screen
 */
export async function generateScreenVariants(
    context: Context,
    screen: KeyScreen,
    feedbackHint?: string
): Promise<ScreenVariant[]> {
    log(`Generating variants for: ${screen.name} (sequential for feedback)`);

    // For single screen regeneration, run in parallel for that screen
    const variants = await Promise.all(
        (['A', 'B', 'C'] as const).map(variantLabel =>
            generateSingleVariant(context, screen, variantLabel, feedbackHint)
        )
    );

    log(`Generated ${variants.length} variants for ${screen.name}`);
    return variants;
}

/**
 * Process screen feedback from user
 */
export async function handleScreenFeedback(
    context: Context,
    feedback: ScreenFeedback
): Promise<ScreenFeedbackResult> {
    log(`Processing feedback: ${feedback.action} for ${feedback.screenType}`);

    const uiuxData = context.planningData?.uiuxData;
    if (!uiuxData) {
        return { needsRegeneration: false, moveToNext: true };
    }

    switch (feedback.action) {
        case 'approve':
            // Mark the selected variant as approved
            const variant = uiuxData.screenVariants.find(
                v => v.screenType === feedback.screenType && v.variant === feedback.selectedVariant
            );
            if (variant) {
                variant.status = 'approved';
            }

            // Add to approved screens
            if (!uiuxData.approvedScreens.includes(feedback.screenType)) {
                uiuxData.approvedScreens.push(feedback.screenType);
            }

            // Update confidence
            const screenWeight = 40 / uiuxData.keyScreens.length;
            uiuxData.confidenceScore += screenWeight;

            wsManager.sendMessage(context.projectId, {
                message: `✅ **${feedback.screenType}** variant **${feedback.selectedVariant}** approved!`
            });

            return { needsRegeneration: false, moveToNext: true };

        case 'mix':
            wsManager.sendMessage(context.projectId, {
                message: `🔀 Creating a mixed variant based on: "${feedback.mixInstructions}"`
            });
            // For now, treat mix as regenerate with feedback
            return { needsRegeneration: true, moveToNext: false };

        case 'regenerate':
            wsManager.sendMessage(context.projectId, {
                message: `🔄 Regenerating with feedback: "${feedback.feedback}"`
            });
            return { needsRegeneration: true, moveToNext: false };

        case 'reject_all':
            wsManager.sendMessage(context.projectId, {
                message: `❌ All variants rejected. Let me try a different approach...`
            });
            return { needsRegeneration: true, moveToNext: false };

        default:
            return { needsRegeneration: false, moveToNext: true };
    }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function buildGenerationContext(context: Context, screen: KeyScreen, feedbackHint?: string): string {
    const uiuxData = context.planningData?.uiuxData;

    let ctx = `# Screen Generation Context

## Screen: ${screen.name}
Type: ${screen.type}
Description: ${screen.description}
Features: ${screen.features.join(', ')}

## Design Direction
Mood: ${uiuxData?.mood || 'minimal'}
`;

    if (uiuxData?.tasteAnalysis) {
        ctx += `
Design Signature: ${uiuxData.tasteAnalysis.designSignature}
Preferences:
- Whitespace: ${uiuxData.tasteAnalysis.preferences.whitespace}
- Corners: ${uiuxData.tasteAnalysis.preferences.corners}
- Color Style: ${uiuxData.tasteAnalysis.preferences.colorStyle}
- Density: ${uiuxData.tasteAnalysis.preferences.density}
- Animations: ${uiuxData.tasteAnalysis.preferences.animations}
`;
    }

    if (feedbackHint) {
        ctx += `\n## User Feedback to Incorporate\n${feedbackHint}\n`;
    }

    return ctx;
}

function getVariantHint(variant: 'A' | 'B' | 'C'): string {
    switch (variant) {
        case 'A':
            return 'Make this the "classic" option - clean, conventional, safe choice.';
        case 'B':
            return 'Make this the "bold" option - more creative, unique layout or colors.';
        case 'C':
            return 'Make this the "experimental" option - push boundaries, try something unexpected.';
    }
}

function getDefaultScreens(): KeyScreen[] {
    return [
        {
            type: 'dashboard',
            name: 'Dashboard',
            priority: 1,
            description: 'Main view showing key metrics and navigation',
            features: ['stats cards', 'navigation', 'quick actions']
        },
        {
            type: 'login',
            name: 'Login',
            priority: 2,
            description: 'User authentication screen',
            features: ['email input', 'password input', 'submit button', 'social login']
        }
    ];
}

function getFallbackHTML(screenName: string, variant: string, device?: 'mobile' | 'tablet' | 'pc'): string {
    const deviceLabel = device ? ` (${device})` : '';
    const maxWidth = device === 'pc' ? '1440px' : device === 'tablet' ? '1080px' : '423px';
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${screenName} - Variant ${variant}${deviceLabel}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; }
        .container { max-width: ${maxWidth}; margin: 0 auto; padding: 2rem; }
        h1 { font-size: 2rem; margin-bottom: 1rem; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${screenName}</h1>
        <p>Variant ${variant}${deviceLabel} preview</p>
    </div>
</body>
</html>`;
}

function getFallbackCSS(): string {
    return `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; }
.container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
h1 { font-size: 2rem; margin-bottom: 1rem; }`;
}
