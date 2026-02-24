// uiuxHandler/screenGenerator.ts
// Three-phase screen generation: Design Brief → Variant Design Prompt → Responsive HTML

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
    VariantDesignPrompt,
    ComponentDesignSpec,
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
    screen: KeyScreen,
    userDescription?: string,
    referenceHTML?: string
): Promise<ScreenDesignBrief> {
    log(`Generating design brief for: ${screen.name}${userDescription ? ' (user-directed)' : ''}${referenceHTML ? ' (with reference)' : ''}`);
    wsManager.sendLog(context.projectId, `📋 Generating design brief for: ${screen.name}...`);

    const uiuxData = context.planningData?.uiuxData;
    const briefContext = buildBriefContext(context, screen, userDescription, referenceHTML);

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
// PHASE 2: VARIANT DESIGN PROMPT GENERATION
// ==========================================

/**
 * Generate a variant-specific design prompt from a brief
 * The design prompt contains explicit styling decisions for every component
 * @param userDescription Optional free-text from user describing how this variant should differ
 * @param referenceHTML Optional HTML from a reference variant to use as a starting point
 */
export async function generateDesignPromptForVariant(
    context: Context,
    screen: KeyScreen,
    brief: ScreenDesignBrief,
    variantLabel: string,
    userDescription?: string,
    referenceHTML?: string
): Promise<VariantDesignPrompt> {
    log(`Generating design prompt for: ${screen.name} Variant ${variantLabel}${userDescription ? ' (user-directed)' : ''}${referenceHTML ? ' (with reference)' : ''}`);
    wsManager.sendLog(context.projectId, `📐 Generating design prompt: ${screen.name} Variant ${variantLabel}...`);

    const userPrompt = buildDesignPromptInput(context, brief, variantLabel, userDescription, referenceHTML);

    const response = await callLLMWithLogging(
        context.projectId,
        `Design Prompt: ${screen.name} Variant ${variantLabel}`,
        [
            { role: 'system', content: PROMPTS.VARIANT_DESIGN_PROMPT },
            { role: 'user', content: userPrompt }
        ],
        { temperature: 0.7, max_tokens: 4000 }
    );

    const designPrompt = safeJSONParse<VariantDesignPrompt>(response.content, {
        screenName: screen.name,
        screenType: screen.type,
        variant: variantLabel,
        layoutStrategy: brief.layout?.structure || 'Standard layout',
        componentSpecs: (Array.isArray(brief.components) ? brief.components : []).map(c => ({
            name: c.name,
            htmlStructure: (c as any).htmlStructure || `div.${c.name.toLowerCase().replace(/\s+/g, '-')}`,
            cssDirectives: (c as any).cssDirection || 'padding: 16px; border-radius: 8px;',
            interactionNotes: 'hover: subtle highlight'
        })),
        colorDirectives: 'Primary: #6366f1, Background: #0f172a, Surface: #1e293b, Text: #f8fafc',
        typographyDirectives: 'Font: system-ui. Headings: 600 weight. Body: 400 weight, 1rem.',
        spacingNotes: 'Standard spacing: 16px gaps, 24px section padding.',
        overallNotes: `Variant ${variantLabel} for ${screen.name}`
    });

    log(`Design prompt generated for: ${screen.name} Variant ${variantLabel} (${designPrompt.componentSpecs?.length || 0} component specs)`);
    return designPrompt;
}

/**
 * Generate design prompts for all screens in parallel (1 per screen — variant A only)
 * Returns a Map keyed by "ScreenName_A" (e.g. "Dashboard_A")
 */
export async function generateAllDesignPrompts(
    context: Context,
    briefMap: Map<string, ScreenDesignBrief>,
    screens: KeyScreen[]
): Promise<Map<string, VariantDesignPrompt>> {
    // Check cache first
    const cached = getCachedUIUXStage<Record<string, VariantDesignPrompt>>(context, UIUXCacheKey.DESIGN_PROMPTS);
    if (cached) {
        log(`Using cached design prompts (${Object.keys(cached).length} prompts)`);
        const promptMap = new Map<string, VariantDesignPrompt>();
        for (const [key, value] of Object.entries(cached)) {
            promptMap.set(key, value);
        }
        return promptMap;
    }

    const totalPrompts = screens.length;
    log(`Generating ${totalPrompts} design prompts in parallel (1 per screen)...`);
    wsManager.sendLog(context.projectId, `📐 Phase 2: Generating ${totalPrompts} design prompts in parallel...`);

    // One design prompt per screen (variant A only)
    const tasks: Array<{ screen: KeyScreen; brief: ScreenDesignBrief }> = [];
    screens.forEach(screen => {
        const brief = briefMap.get(screen.name);
        if (brief) {
            tasks.push({ screen, brief });
        }
    });

    const results = await Promise.all(
        tasks.map(async (task) => {
            try {
                const designPrompt = await generateDesignPromptForVariant(
                    context, task.screen, task.brief, 'A'
                );
                const key = `${task.screen.name}_A`;
                return { success: true, key, designPrompt };
            } catch (error: any) {
                log(`Error generating design prompt for ${task.screen.name}: ${error.message}`);
                return { success: false, key: `${task.screen.name}_A`, designPrompt: null };
            }
        })
    );

    const promptMap = new Map<string, VariantDesignPrompt>();
    for (const result of results) {
        if (result.success && result.designPrompt) {
            promptMap.set(result.key, result.designPrompt);
        }
    }

    // Cache the design prompts
    const cacheObj: Record<string, VariantDesignPrompt> = {};
    promptMap.forEach((v, k) => { cacheObj[k] = v; });
    setCachedUIUXStage(context, UIUXCacheKey.DESIGN_PROMPTS, cacheObj);

    log(`Generated ${promptMap.size}/${totalPrompts} design prompts`);
    return promptMap;
}

// ==========================================
// PHASE 3: RESPONSIVE HTML GENERATION
// ==========================================

/**
 * Generate a SINGLE variant using a variant design prompt
 * Produces ONE responsive HTML file with media queries → assigned to all device slots
 */
export async function generateSingleVariant(
    context: Context,
    screen: KeyScreen,
    variantLabel: string,
    designPrompt: VariantDesignPrompt,
    feedbackHint?: string,
    slotId?: string
): Promise<ScreenVariant> {
    log(`Generating ${screen.name} variant ${variantLabel} (responsive HTML)...`);
    wsManager.sendLog(context.projectId, `🎨 Generating ${screen.name} Variant ${variantLabel}...`);

    const uiuxData = context.planningData?.uiuxData;
    if (!uiuxData) {
        throw new Error('UIUXData not initialized');
    }

    // Build user prompt from the design prompt
    const userPrompt = buildHTMLPromptFromDesignPrompt(designPrompt, feedbackHint);

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
        status: variantLabel === 'A' ? 'selected' : 'generated'
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
                        status: variant.status,
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

    // ── Phase 2: Generate design prompts in parallel (1 per screen) ──
    wsManager.sendLog(context.projectId, `📐 Phase 2: Generating ${screens.length} design prompts...`);
    const designPromptMap = await generateAllDesignPrompts(context, briefMap, screens);

    // ── Phase 3: Generate HTML variants in parallel (1 per screen) ──
    const totalVariants = screens.length;
    log(`Phase 3: Generating ${totalVariants} responsive HTML variants in parallel...`);
    wsManager.sendLog(context.projectId, `⚡ Phase 3: Generating ${totalVariants} screen designs in parallel...`);

    // One variant per screen (variant A), PRE-ASSIGN slot IDs
    const allTasks: Array<{
        screen: KeyScreen;
        variant: string;
        designPrompt: VariantDesignPrompt;
        slotId: string;
        slotIndex: number;
    }> = [];

    let slotIndex = 0;
    screens.forEach((screen) => {
        const key = `${screen.name}_A`;
        const designPrompt = designPromptMap.get(key);
        if (designPrompt) {
            const { generateSlotId } = require('./types');
            allTasks.push({
                screen,
                variant: 'A',
                designPrompt,
                slotId: generateSlotId(),
                slotIndex: slotIndex++
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
                        context, task.screen, task.variant, task.designPrompt, feedbackHint, task.slotId
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
                            status: variant.status,
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
    specificVariant?: string
): Promise<ScreenVariant[]> {
    log(`Regenerating variants for: ${screen.name} ${specificVariant ? `(Variant ${specificVariant})` : '(All Variants)'}`);

    // Generate a fresh brief for the screen
    const brief = await generateDesignBrief(context, screen);

    const variantLabels: string[] = specificVariant ? [specificVariant] : ['A'];
    const totalVariants = variantLabels.length;
    let completedCount = 0;
    const MAX_RETRIES = 2;

    // Generate design prompts for the variants being regenerated
    log(`Generating ${variantLabels.length} design prompt(s) for regeneration...`);
    const designPrompts = new Map<string, VariantDesignPrompt>();
    await Promise.all(
        variantLabels.map(async (variantLabel) => {
            try {
                const dp = await generateDesignPromptForVariant(context, screen, brief, variantLabel);
                designPrompts.set(variantLabel, dp);
            } catch (error: any) {
                log(`Error generating design prompt for ${screen.name} ${variantLabel}: ${error.message}`);
            }
        })
    );

    // Pre-assign slot IDs for regeneration
    const { generateSlotId } = require('./types');
    const tasks = variantLabels.map((variantLabel) => {
        // Calculate the correct slot index based on the variant label
        const slotIndex = ['A', 'B', 'C'].indexOf(variantLabel);
        return {
            variantLabel,
            designPrompt: designPrompts.get(variantLabel),
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

    // Generate all variants in parallel — emit each as it completes
    const results = await Promise.all(
        tasks.map(async (task) => {
            if (!task.designPrompt) {
                log(`❌ No design prompt for ${screen.name} ${task.variantLabel}, skipping`);
                return { success: false, variant: null };
            }

            let lastError: any = null;

            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                try {
                    if (attempt > 0) {
                        log(`🔄 Retry ${attempt}/${MAX_RETRIES} for ${screen.name} Variant ${task.variantLabel}...`);
                        wsManager.sendLog(context.projectId, `🔄 Retrying ${screen.name} Variant ${task.variantLabel} (attempt ${attempt + 1})...`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }

                    const variant = await generateSingleVariant(context, screen, task.variantLabel, task.designPrompt, feedbackHint, task.slotId);

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
                            status: variant.status,
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
 * Generate a single on-demand variant for a screen, driven by user description.
 * Called when user clicks "New Variant" in the canvas editor.
 * @param screenName The screen to create a variant for
 * @param variantLabel The next variant label (B, C, D, ...)
 * @param userDescription Free-text describing how the variant should differ
 * @param referenceHTML Optional HTML from a reference variant to use as a starting point
 */
export async function generateOnDemandVariant(
    context: Context,
    screenName: string,
    variantLabel: string,
    userDescription: string,
    referenceHTML?: string
): Promise<ScreenVariant | null> {
    log(`Generating on-demand variant: ${screenName} Variant ${variantLabel}`);
    wsManager.sendLog(context.projectId, `🎨 Creating new variant ${variantLabel} for ${screenName}...`);

    const uiuxData = context.planningData?.uiuxData;
    if (!uiuxData) {
        log('No uiuxData available');
        return null;
    }

    // Find the screen definition
    const screen = uiuxData.keyScreens.find((s: KeyScreen) => s.name === screenName);
    if (!screen) {
        log(`Screen not found: ${screenName}`);
        return null;
    }

    // Generate the slot ID and emit reservation IMMEDIATELY so client shows skeleton
    const { generateSlotId } = require('./types');
    const slotId = generateSlotId();

    wsManager.broadcast(context.projectId, {
        type: "variant_slot_reserved",
        timestamp: new Date().toISOString(),
        data: {
            slotId,
            screenName: screen.name,
            screenType: screen.type,
            variant: variantLabel,
            totalSlots: 1,
            slotIndex: 0,
            htmlContent: getFallbackHTML(screen.name, variantLabel),
            description: `Generating: ${userDescription.substring(0, 50)}...`,
            version: 1,
            status: "pending",
            isOnDemand: true
        }
    });

    // Generate the HTML variant
    try {
        // Stage 1: Design Brief
        wsManager.broadcast(context.projectId, {
            type: "variant_generation_progress",
            timestamp: new Date().toISOString(),
            data: { slotId, screenName: screen.name, variant: variantLabel, stage: "brief", message: "Generating design brief..." }
        });
        const brief = await generateDesignBrief(context, screen, userDescription, referenceHTML);

        // Stage 2: Design Prompt
        wsManager.broadcast(context.projectId, {
            type: "variant_generation_progress",
            timestamp: new Date().toISOString(),
            data: { slotId, screenName: screen.name, variant: variantLabel, stage: "prompt", message: "Creating design prompt..." }
        });
        const designPrompt = await generateDesignPromptForVariant(
            context, screen, brief, variantLabel, userDescription, referenceHTML
        );

        // Stage 3: HTML Generation
        wsManager.broadcast(context.projectId, {
            type: "variant_generation_progress",
            timestamp: new Date().toISOString(),
            data: { slotId, screenName: screen.name, variant: variantLabel, stage: "html", message: "Generating HTML..." }
        });
        const variant = await generateSingleVariant(
            context, screen, variantLabel, designPrompt, undefined, slotId
        );

        // Emit the completed variant
        wsManager.broadcast(context.projectId, {
            type: "screen_preview_single",
            timestamp: new Date().toISOString(),
            data: {
                slotId,
                screenName: variant.screenName,
                screenType: variant.screenType,
                variant: variant.variant,
                id: variant.id,
                status: variant.status,
                description: variant.description,
                htmlContent: variant.htmlContent,
                cssContent: variant.cssContent,
                deviceScreens: variant.deviceScreens,
                completedCount: 1,
                totalVariants: 1,
                isRetry: false,
                isOnDemand: true
            }
        });

        log(`✅ On-demand variant generated: ${screenName} Variant ${variantLabel}`);
        return variant;
    } catch (error: any) {
        log(`❌ Failed to generate on-demand variant: ${error.message}`);
        wsManager.broadcast(context.projectId, {
            type: "screen_preview_single",
            timestamp: new Date().toISOString(),
            data: {
                slotId,
                screenName: screen.name,
                screenType: screen.type,
                variant: variantLabel,
                error: true,
                errorMessage: error.message,
                completedCount: 1,
                totalVariants: 1,
                isOnDemand: true
            }
        });
        return null;
    }
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
        case 'select':
            // Mark the selected variant as selected
            const variant = uiuxData.screenVariants.find(
                v => v.screenType === feedback.screenType && v.variant === feedback.selectedVariant
            );
            if (variant) {
                variant.status = 'selected';

                // If a specific version was selected, restore its content
                if (feedback.selectedVersion && variant.versions) {
                    const targetVersion = variant.versions.find(v => v.version === feedback.selectedVersion);
                    if (targetVersion) {
                        variant.htmlContent = targetVersion.htmlContent;
                        variant.cssContent = targetVersion.cssContent;
                        variant.description = targetVersion.description;
                        if (targetVersion.deviceScreens) {
                            variant.deviceScreens = targetVersion.deviceScreens;
                        }
                        variant.version = targetVersion.version;
                        log(`Restored Variant ${variant.variant} to version ${targetVersion.version}`);
                    }
                }
            }

            // Add to selected screens
            if (!uiuxData.selectedScreens.includes(feedback.screenType)) {
                uiuxData.selectedScreens.push(feedback.screenType);
            }

            // Update confidence
            const screenWeight = 40 / uiuxData.keyScreens.length;
            uiuxData.confidenceScore += screenWeight;

            wsManager.sendMessage(context.projectId, {
                message: `✅ **${feedback.screenType}** variant **${feedback.selectedVariant}** selected!`
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
function buildBriefContext(context: Context, screen: KeyScreen, userDescription?: string, referenceHTML?: string): string {
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

    if (userDescription) {
        ctx += `\n## User Description\nThe user wants this variant to have the following characteristics:\n${userDescription}\n`;
    }

    if (referenceHTML) {
        ctx += `\n## Reference Variant HTML\nUse this existing variant as a starting reference for the layout and structure:\n\`\`\`html\n${referenceHTML}\n\`\`\`\n`;
    }

    return ctx;
}

/**
 * Build the user prompt input for the VARIANT_DESIGN_PROMPT LLM call
 * Input: Brief + Variant label + Mood + Taste
 */
function buildDesignPromptInput(
    context: Context,
    brief: ScreenDesignBrief,
    variantLabel: string,
    userDescription?: string,
    referenceHTML?: string
): string {
    const uiuxData = context.planningData?.uiuxData;

    let prompt = `# Design Brief\n\n${JSON.stringify(brief, null, 2)}\n\n`;
    prompt += `# Variant: ${variantLabel}\n`;
    prompt += `# Mood: ${uiuxData?.mood || 'minimal'}\n`;

    if (uiuxData?.tasteAnalysis) {
        prompt += `\n# Taste Analysis\nDesign Signature: ${uiuxData.tasteAnalysis.designSignature}\n`;
        prompt += `Preferences:\n`;
        prompt += `- Whitespace: ${uiuxData.tasteAnalysis.preferences.whitespace}\n`;
        prompt += `- Corners: ${uiuxData.tasteAnalysis.preferences.corners}\n`;
        prompt += `- Color Style: ${uiuxData.tasteAnalysis.preferences.colorStyle}\n`;
        prompt += `- Density: ${uiuxData.tasteAnalysis.preferences.density}\n`;
        prompt += `- Animations: ${uiuxData.tasteAnalysis.preferences.animations}\n`;
    }

    if (userDescription) {
        prompt += `\n# User Description\nThe user wants this variant to differ from the primary design as follows:\n${userDescription}\n`;
    }

    if (referenceHTML) {
        prompt += `\n# Reference Variant HTML\nThe user selected an existing variant as a reference. Use this HTML as a starting point and modify it according to the user's description above:\n\`\`\`html\n${referenceHTML}\n\`\`\`\n`;
    }

    return prompt;
}

/**
 * Build the user prompt for HTML generation from a VariantDesignPrompt
 * This replaces the old buildVariantPrompt + getVariantHint functions
 */
function buildHTMLPromptFromDesignPrompt(
    designPrompt: VariantDesignPrompt,
    feedbackHint?: string
): string {
    const componentSpecs = Array.isArray(designPrompt.componentSpecs) ? designPrompt.componentSpecs : [];

    let prompt = `# Variant Design Prompt\n\n`;
    prompt += `## Screen: ${designPrompt.screenName} (${designPrompt.screenType})\n`;
    prompt += `## Variant: ${designPrompt.variant}\n\n`;

    prompt += `## Layout Strategy\n${designPrompt.layoutStrategy || 'Standard layout'}\n\n`;

    prompt += `## Components (${componentSpecs.length})\n`;
    componentSpecs.forEach((spec, i) => {
        prompt += `\n### ${i + 1}. ${spec.name}\n`;
        prompt += `- HTML Structure: ${spec.htmlStructure}\n`;
        prompt += `- CSS Directives: ${spec.cssDirectives}\n`;
        if (spec.interactionNotes) {
            prompt += `- Interactions: ${spec.interactionNotes}\n`;
        }
    });

    prompt += `\n## Color Directives\n${designPrompt.colorDirectives || 'Use mood-appropriate colors'}\n`;
    prompt += `\n## Typography Directives\n${designPrompt.typographyDirectives || 'Use system fonts'}\n`;
    prompt += `\n## Spacing Notes\n${designPrompt.spacingNotes || 'Standard spacing'}\n`;
    prompt += `\n## Overall Design Notes\n${designPrompt.overallNotes || 'Follow the design prompt faithfully'}\n`;

    if (feedbackHint) {
        prompt += `\n---\n\n## User Feedback to Incorporate\n${feedbackHint}\n`;
    }

    return prompt;
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
