// uiuxHandler/screenGenerator.ts
// Two-phase screen generation: Design Brief → Responsive HTML

import { Context } from "../../types/context";
import { fsManager } from "../../../fs";
import { memoryService } from "../../../memory";
import { wsManager } from "../../../websocket/manager";
import {
    KeyScreen,
    ScreenVariant,
    ScreenFeedback,
    ScreenType,
    ScreenDesignBrief,
    DeviceScreens,
    generateScreenVariantId
} from "./types";
import { callLLMWithLogging, log, safeJSONParse, cleanHTML } from "./utils";
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
            { role: 'user', content: prdContent }
        ],
        { temperature: 0.6, max_tokens: 4000 }
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

// ==========================================
// PHASE 1: DESIGN BRIEF GENERATION
// ==========================================

/**
 * Generate a design brief for a single screen
 * The brief is a structured spec: layout, components, content, design notes
 * Cached per screen and reused across all 3 variants
 */
export async function generateDesignBrief(
    context: Context,
    screen: KeyScreen
): Promise<ScreenDesignBrief> {
    log(`Generating design brief for: ${screen.name}`);
    wsManager.sendLog(context.projectId, `📋 Generating design brief for: ${screen.name}...`);

    const uiuxData = context.planningData?.uiuxData;
    const briefContext = buildBriefContext(context, screen);

    const response = await callLLMWithLogging(
        context.projectId,
        `Design Brief: ${screen.name}`,
        [
            { role: 'system', content: PROMPTS.DESIGN_BRIEF_PROMPT },
            { role: 'user', content: briefContext }
        ],
        { temperature: 0.7, max_tokens: 4000 }
    );

    const brief = safeJSONParse<ScreenDesignBrief>(response.content, {
        screenName: screen.name,
        screenType: screen.type,
        layout: {
            structure: 'Single page layout with header and main content',
            headerType: 'Top navigation bar',
            navigationStyle: 'Top navigation',
            contentZones: ['Main content area']
        },
        components: screen.features.map(f => ({
            name: f,
            description: f,
            placement: 'Main content area'
        })),
        content: {
            headings: [screen.name],
            labels: screen.features,
            sampleData: []
        },
        designNotes: `Design aligned with ${uiuxData?.mood || 'minimal'} mood`
    });

    log(`Design brief generated for: ${screen.name} (${brief.components.length} components)`);
    return brief;
}


export async function generateAllBriefs(
    context: Context,
    screens: KeyScreen[]
): Promise<Map<string, ScreenDesignBrief>> {
    // Check cache first
    const cached = getCachedUIUXStage<Record<string, ScreenDesignBrief>>(context, UIUXCacheKey.SCREEN_BRIEFS);
    if (cached) {
        log(`Using cached design briefs (${Object.keys(cached).length} briefs)`);
        const briefMap = new Map<string, ScreenDesignBrief>();
        for (const [key, value] of Object.entries(cached)) {
            briefMap.set(key, value);
        }
        return briefMap;
    }

    log(`Generating ${screens.length} design briefs in parallel...`);
    wsManager.sendLog(context.projectId, `📋 Generating ${screens.length} design briefs...`);

    const results = await Promise.all(
        screens.map(async (screen) => {
            try {
                const brief = await generateDesignBrief(context, screen);
                return { success: true, screenName: screen.name, brief };
            } catch (error: any) {
                log(`Error generating brief for ${screen.name}: ${error.message}`);
                return { success: false, screenName: screen.name, brief: null };
            }
        })
    );

    const briefMap = new Map<string, ScreenDesignBrief>();
    for (const result of results) {
        if (result.success && result.brief) {
            briefMap.set(result.screenName, result.brief);
        }
    }

    // Cache the briefs
    const cacheObj: Record<string, ScreenDesignBrief> = {};
    briefMap.forEach((v, k) => { cacheObj[k] = v; });
    setCachedUIUXStage(context, UIUXCacheKey.SCREEN_BRIEFS, cacheObj);

    log(`Generated ${briefMap.size}/${screens.length} design briefs`);
    return briefMap;
}

// ==========================================
// PHASE 2: RESPONSIVE HTML GENERATION
// ==========================================

/**
 * Generate a SINGLE variant using a design brief
 * Produces ONE responsive HTML file with media queries → assigned to all device slots
 */
export async function generateSingleVariant(
    context: Context,
    screen: KeyScreen,
    variantLabel: 'A' | 'B' | 'C',
    brief: ScreenDesignBrief,
    feedbackHint?: string,
    slotId?: string
): Promise<ScreenVariant> {
    log(`Generating ${screen.name} variant ${variantLabel} (responsive HTML)...`);
    wsManager.sendLog(context.projectId, `🎨 Generating ${screen.name} Variant ${variantLabel}...`);

    const uiuxData = context.planningData?.uiuxData;
    if (!uiuxData) {
        throw new Error('UIUXData not initialized');
    }

    // Build user prompt with brief + variant hint + feedback
    const userPrompt = buildVariantPrompt(context, brief, variantLabel, feedbackHint);

    const response = await callLLMWithLogging(
        context.projectId,
        `Generate ${screen.name} Variant ${variantLabel}`,
        [
            { role: 'system', content: PROMPTS.RESPONSIVE_SCREEN_PROMPT },
            { role: 'user', content: userPrompt }
        ],
        { temperature: 0.8, max_tokens: 16000 }
    );

    const parsed = safeJSONParse<{
        html: string;
        description: string;
    }>(response.content, {
        html: getFallbackHTML(screen.name, variantLabel),
        description: `Variant ${variantLabel} for ${screen.name}`
    });

    // Clean HTML output
    const responsiveHTML = cleanHTML(parsed.html);

    // Same HTML for all device slots (media queries handle responsiveness)
    const deviceScreens: DeviceScreens = {
        mobile: { htmlContent: responsiveHTML, cssContent: '' },
        tablet: { htmlContent: responsiveHTML, cssContent: '' },
        pc: { htmlContent: responsiveHTML, cssContent: '' }
    };

    return {
        id: generateScreenVariantId(),
        slotId, // Attach the slot ID if provided
        screenType: screen.type,
        screenName: screen.name,
        variant: variantLabel,
        htmlContent: responsiveHTML,
        cssContent: '',
        deviceScreens,
        description: parsed.description,
        status: 'generated'
    };
}

/**
 * Generate ALL variants for ALL screens in parallel
 * Two-phase: briefs first (parallel), then variants (parallel)
 * Now with slot-based reservation: each variant gets a stable slotId upfront
 */
export async function generateAllVariantsParallel(
    context: Context,
    screens: KeyScreen[],
    feedbackHint?: string
): Promise<ScreenVariant[]> {
    // Check variant cache first (only when no feedbackHint)
    if (!feedbackHint) {
        const cached = getCachedUIUXStage<ScreenVariant[]>(context, UIUXCacheKey.SCREEN_VARIANTS);
        if (cached && cached.length > 0) {
            log(`Using cached screen variants (${cached.length} variants)`);
            wsManager.sendLog(context.projectId, `✅ Using cached screen variants (${cached.length} variants)`);

            // EMIT EVENTS FOR CACHED VARIANTS so client can render them
            // 1. Emit slot reservations
            cached.forEach((variant, index) => {
                wsManager.broadcast(context.projectId, {
                    type: "variant_slot_reserved",
                    timestamp: new Date().toISOString(),
                    data: {
                        slotId: variant.slotId || `slot-${variant.id}`, // Fallback if slotId missing in old cache
                        screenName: variant.screenName,
                        screenType: variant.screenType,
                        variant: variant.variant,
                        totalSlots: cached.length,
                        slotIndex: index,
                        htmlContent: getFallbackHTML(variant.screenName, variant.variant),
                        description: "Loading from cache...",
                        version: 1,
                        status: "pending"
                    }
                });
            });

            // 2. Emit completed variants
            cached.forEach((variant, index) => {
                wsManager.broadcast(context.projectId, {
                    type: "screen_preview_single",
                    timestamp: new Date().toISOString(),
                    data: {
                        slotId: variant.slotId || `slot-${variant.id}`,
                        screenName: variant.screenName,
                        screenType: variant.screenType,
                        variant: variant.variant,
                        id: variant.id,
                        description: variant.description,
                        htmlContent: variant.htmlContent,
                        cssContent: variant.cssContent,
                        deviceScreens: variant.deviceScreens,
                        completedCount: index + 1,
                        totalVariants: cached.length,
                        isRetry: false
                    }
                });
            });

            return cached;
        }
    }

    // ── Phase 1: Generate all design briefs in parallel ──
    wsManager.sendLog(context.projectId, `📋 Phase 1: Generating design briefs for ${screens.length} screens...`);
    const briefMap = await generateAllBriefs(context, screens);

    // ── Phase 2: Generate all variants in parallel using briefs ──
    const totalVariants = screens.length * 3;
    log(`Phase 2: Generating ${totalVariants} responsive HTML variants in parallel...`);
    wsManager.sendLog(context.projectId, `⚡ Phase 2: Generating ${totalVariants} variants in parallel...`);

    // Flatten all screen+variant combinations and PRE-ASSIGN slot IDs
    const allTasks: Array<{
        screen: KeyScreen;
        variant: 'A' | 'B' | 'C';
        brief: ScreenDesignBrief;
        slotId: string;
        slotIndex: number;
    }> = [];

    let slotIndex = 0;
    screens.forEach((screen) => {
        const brief = briefMap.get(screen.name);
        if (brief) {
            (['A', 'B', 'C'] as const).forEach((variant) => {
                const { generateSlotId } = require('./types');
                allTasks.push({
                    screen,
                    variant,
                    brief,
                    slotId: generateSlotId(),
                    slotIndex: slotIndex++
                });
            });
        }
    });

    // ── EMIT SLOT RESERVATIONS UPFRONT ──
    log(`Emitting ${allTasks.length} slot reservations...`);
    allTasks.forEach((task) => {
        wsManager.broadcast(context.projectId, {
            type: "variant_slot_reserved",
            timestamp: new Date().toISOString(),
            data: {
                slotId: task.slotId,
                screenName: task.screen.name,
                screenType: task.screen.type,
                variant: task.variant,
                totalSlots: allTasks.length,
                slotIndex: task.slotIndex,
                htmlContent: getFallbackHTML(task.screen.name, task.variant),
                description: "Initializing variant...",
                version: 1,
                status: "pending"
            }
        });
    });

    // Track completed count for progress
    let completedCount = 0;

    // Execute ALL variant generations in parallel — with auto-retry
    const MAX_RETRIES = 2;
    const results = await Promise.all(
        allTasks.map(async (task) => {
            let lastError: any = null;

            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                try {
                    if (attempt > 0) {
                        log(`🔄 Retry ${attempt}/${MAX_RETRIES} for ${task.screen.name} Variant ${task.variant}...`);
                        wsManager.broadcast(context.projectId, { type: "log", timestamp: new Date().toISOString(), data: { message: `🔄 Retrying ${task.screen.name} Variant ${task.variant} (attempt ${attempt + 1})...` } });
                        // Brief delay before retry
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }

                    const variant = await generateSingleVariant(
                        context, task.screen, task.variant, task.brief, feedbackHint, task.slotId
                    );

                    completedCount++;
                    log(`✅ Completed ${task.screen.name} Variant ${task.variant} (${completedCount}/${totalVariants})`);

                    // Emit this variant immediately to the client with slotId
                    wsManager.broadcast(context.projectId, {
                        type: "screen_preview_single",
                        timestamp: new Date().toISOString(),
                        data: {
                            slotId: task.slotId,
                            screenName: variant.screenName,
                            screenType: variant.screenType,
                            variant: variant.variant,
                            id: variant.id,
                            description: variant.description,
                            htmlContent: variant.htmlContent,
                            cssContent: variant.cssContent,
                            deviceScreens: variant.deviceScreens,
                            completedCount,
                            totalVariants,
                            isRetry: attempt > 0
                        }
                    });

                    return { success: true, variant };
                } catch (error: any) {
                    lastError = error;
                    log(`⚠️ Attempt ${attempt + 1} failed for ${task.screen.name} ${task.variant}: ${error.message}`);
                }
            }

            // All retries exhausted — notify client with slotId
            completedCount++;
            log(`❌ All retries exhausted for ${task.screen.name} ${task.variant}: ${lastError?.message}`);

            wsManager.broadcast(context.projectId, {
                type: "screen_preview_single",
                timestamp: new Date().toISOString(),
                data: {
                    slotId: task.slotId,
                    screenName: task.screen.name,
                    screenType: task.screen.type,
                    variant: task.variant,
                    error: true,
                    errorMessage: lastError?.message || 'Generation failed after retries',
                    retriesExhausted: true,
                    completedCount,
                    totalVariants
                }
            });

            return { success: false, variant: null, error: lastError?.message };
        })
    );

    // Collect successful variants
    const variants = results
        .filter((r): r is { success: true; variant: ScreenVariant } => r.success && r.variant !== null)
        .map(r => r.variant);

    // Cache the results (only when no feedbackHint)
    if (!feedbackHint && variants.length > 0) {
        setCachedUIUXStage(context, UIUXCacheKey.SCREEN_VARIANTS, variants);
    }

    log(`Generation complete: ${variants.length}/${totalVariants} variants generated`);
    return variants;
}

/**
 * Generate 3 screen variants for a single screen (used for regeneration with feedback)
 * Emits screen_preview_single for each variant as it completes (progressive rendering)
 * Now with slot-based reservation: pre-assigns slot IDs for regenerated variants
 */
export async function generateScreenVariants(
    context: Context,
    screen: KeyScreen,
    feedbackHint?: string,
    specificVariant?: 'A' | 'B' | 'C'
): Promise<ScreenVariant[]> {
    log(`Regenerating variants for: ${screen.name} ${specificVariant ? `(Variant ${specificVariant})` : '(All Variants)'}`);

    // Generate a fresh brief for the screen
    const brief = await generateDesignBrief(context, screen);

    const variantLabels: Array<'A' | 'B' | 'C'> = specificVariant ? [specificVariant] : ['A', 'B', 'C'];
    const totalVariants = variantLabels.length;
    let completedCount = 0;
    const MAX_RETRIES = 2;

    // Pre-assign slot IDs for regeneration
    const { generateSlotId } = require('./types');
    const tasks = variantLabels.map((variantLabel) => {
        // Calculate the correct slot index based on the variant label
        const slotIndex = ['A', 'B', 'C'].indexOf(variantLabel);
        return {
            variantLabel,
            slotId: generateSlotId(),
            slotIndex
        };
    });

    // Emit slot reservations upfront for regenerated variants
    log(`Emitting ${tasks.length} slot reservations for regeneration...`);
    tasks.forEach((task) => {
        wsManager.broadcast(context.projectId, {
            type: "variant_slot_reserved",
            timestamp: new Date().toISOString(),
            data: {
                slotId: task.slotId,
                screenName: screen.name,
                screenType: screen.type,
                variant: task.variantLabel,
                totalSlots: tasks.length,
                slotIndex: task.slotIndex,
                htmlContent: getFallbackHTML(screen.name, task.variantLabel),
                description: "Initializing variant...",
                version: 1,
                status: "pending"
            }
        });
    });

    // Generate all 3 variants in parallel — emit each as it completes
    const results = await Promise.all(
        tasks.map(async (task) => {
            let lastError: any = null;

            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                try {
                    if (attempt > 0) {
                        log(`🔄 Retry ${attempt}/${MAX_RETRIES} for ${screen.name} Variant ${task.variantLabel}...`);
                        wsManager.sendLog(context.projectId, `🔄 Retrying ${screen.name} Variant ${task.variantLabel} (attempt ${attempt + 1})...`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }

                    const variant = await generateSingleVariant(context, screen, task.variantLabel, brief, feedbackHint, task.slotId);

                    completedCount++;
                    log(`✅ Completed ${screen.name} Variant ${task.variantLabel} (${completedCount}/${totalVariants})`);

                    // Emit this variant immediately with slotId
                    wsManager.broadcast(context.projectId, {
                        type: "screen_preview_single",
                        timestamp: new Date().toISOString(),
                        data: {
                            slotId: task.slotId,
                            screenName: variant.screenName,
                            screenType: variant.screenType,
                            variant: variant.variant,
                            id: variant.id,
                            description: variant.description,
                            htmlContent: variant.htmlContent,
                            cssContent: variant.cssContent,
                            deviceScreens: variant.deviceScreens,
                            completedCount,
                            totalVariants,
                            isRetry: attempt > 0
                        }
                    });

                    return { success: true, variant };
                } catch (error: any) {
                    lastError = error;
                    log(`⚠️ Attempt ${attempt + 1} failed for ${screen.name} ${task.variantLabel}: ${error.message}`);
                }
            }

            // All retries exhausted
            completedCount++;
            log(`❌ All retries exhausted for ${screen.name} ${task.variantLabel}: ${lastError?.message}`);

            wsManager.broadcast(context.projectId, {
                type: "screen_preview_single",
                timestamp: new Date().toISOString(),
                data: {
                    slotId: task.slotId,
                    screenName: screen.name,
                    screenType: screen.type,
                    variant: task.variantLabel,
                    error: true,
                    errorMessage: lastError?.message || 'Generation failed after retries',
                    retriesExhausted: true,
                    completedCount,
                    totalVariants
                }
            });

            return { success: false, variant: null };
        })
    );

    const variants = results
        .filter((r): r is { success: true; variant: ScreenVariant } => r.success && r.variant !== null)
        .map(r => r.variant);

    log(`Generated ${variants.length}/${totalVariants} variants for ${screen.name}`);
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

/**
 * Build context for the design brief LLM call
 */
function buildBriefContext(context: Context, screen: KeyScreen): string {
    const uiuxData = context.planningData?.uiuxData;

    let ctx = `# Design Brief Request

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

    return ctx;
}

/**
 * Build the user prompt for variant generation (includes brief + variant hint)
 */
function buildVariantPrompt(
    context: Context,
    brief: ScreenDesignBrief,
    variantLabel: 'A' | 'B' | 'C',
    feedbackHint?: string
): string {
    const uiuxData = context.planningData?.uiuxData;

    // Safely extract brief fields (LLM may return unexpected shapes)
    const contentZones = Array.isArray(brief.layout?.contentZones) ? brief.layout.contentZones : [];
    const components = Array.isArray(brief.components) ? brief.components : [];
    const headings = Array.isArray(brief.content?.headings) ? brief.content.headings : [];
    const labels = Array.isArray(brief.content?.labels) ? brief.content.labels : [];
    const sampleData = Array.isArray(brief.content?.sampleData) ? brief.content.sampleData : [];

    let prompt = `# Design Brief

## Screen: ${brief.screenName} (${brief.screenType})

## Layout
- Structure: ${brief.layout?.structure || 'Standard layout'}
- Header: ${brief.layout?.headerType || 'Top navigation'}
- Navigation: ${brief.layout?.navigationStyle || 'Standard navigation'}
- Content Zones: ${contentZones.join(', ') || 'Main content area'}

## Components
${components.map(c => `- **${c.name}**: ${c.description} (Placement: ${c.placement})`).join('\n') || '- Standard components'}

## Content
- Headings: ${headings.join(', ') || brief.screenName}
- Labels: ${labels.join(', ') || 'Standard labels'}
- Sample Data: ${sampleData.join(', ') || 'Sample data'}

## Design Notes
${brief.designNotes || 'Follow the selected mood'}

## Mood: ${uiuxData?.mood || 'minimal'}
`;

    if (uiuxData?.tasteAnalysis) {
        prompt += `
## Taste Preferences
- Whitespace: ${uiuxData.tasteAnalysis.preferences.whitespace}
- Corners: ${uiuxData.tasteAnalysis.preferences.corners}
- Color Style: ${uiuxData.tasteAnalysis.preferences.colorStyle}
- Density: ${uiuxData.tasteAnalysis.preferences.density}
- Animations: ${uiuxData.tasteAnalysis.preferences.animations}
`;
    }

    prompt += `\n---\n\nGenerate VARIANT ${variantLabel}.\n${getVariantHint(variantLabel)}`;

    if (feedbackHint) {
        prompt += `\n\n## User Feedback to Incorporate\n${feedbackHint}\n`;
    }

    return prompt;
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

function getFallbackHTML(screenName: string, variant: string): string {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${screenName} - Variant ${variant}</title>
    <style>
        :root {
            --primary: #6366f1;
            --bg: #0f172a;
            --surface: #1e293b;
            --text: #f8fafc;
            --text-muted: #94a3b8;
            --border: #334155;
            --radius: 0.75rem;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .container { max-width: 600px; margin: 0 auto; padding: 2rem; text-align: center; }
        h1 { font-size: 2rem; margin-bottom: 1rem; background: linear-gradient(135deg, var(--primary), #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        p { color: var(--text-muted); line-height: 1.6; }
        .badge { display: inline-block; padding: 0.25rem 0.75rem; background: var(--surface); border: 1px solid var(--border); border-radius: 9999px; font-size: 0.875rem; margin-top: 1rem; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${screenName}</h1>
        <p>Variant ${variant} — Fallback Responsive preview</p>
        <span class="badge">📱 Mobile · 💻 Tablet · 🖥️ Desktop</span>
    </div>
</body>
</html>`;
}
