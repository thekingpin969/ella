// uiuxHandler/index.ts
// Main UIUXHandler class - orchestrates Screen 2: UI/UX Deep Dive

import { BaseHandler } from "../BaseHandler";
import { Context } from "../../types/context";
import { Event } from "../../types/events";
import { wsManager } from "../../../websocket/manager";
import { memoryService } from "../../../memory";
import { saveMessage } from "../../../db/postgres";

// Import types
import { createInitialUIUXData, UIUXData, UIUX_CONFIDENCE_THRESHOLD, KeyScreen, ScreenVariant, ScreenFeedback } from "./types";
import { log } from "./utils";

// Import modules
import { analyzeMoodFromContext, handleMoodSelected } from "./mood";
import { searchInspirations, handleInspirationsRated } from "./inspiration";
import { identifyKeyScreens, generateScreenVariants, generateAllVariantsParallel, handleScreenFeedback, generateOnDemandVariant } from "./screenGenerator";
import { extractDesignTokens } from "./designTokens";
import { generateStyleGuide } from "./styleGuide";
import { generateScreen2Artifacts } from "./artifacts";
import { generateBrandIdentity, handleBrandIdentityFeedback, lockBrandIdentity } from "./brandIdentity";
import { generateBrandDNA, handleBrandDNAFeedback, lockBrandDNA } from "./brandDNA";
import { BrandIdentityFeedback, BrandDNAFeedback } from "./types";

export class UIUXHandler extends BaseHandler {

    handle(context: Context, event: Event): void {
        log(`Handling event: ${event.name}`);
        wsManager.sendLog(context.projectId, `[Screen 2] Handling event: ${event.name}`, { event });

        switch (event.name) {
            case "start_uiux_design":
                this.onStartUIUXDesign(context, event);
                break;
            case "mood_selected":
                this.onMoodSelected(context, event);
                break;
            // Stage 1: Brand Identity
            case "brand_identity_feedback":
                this.onBrandIdentityFeedback(context, event);
                break;
            case "lock_brand_identity":
                this.onLockBrandIdentity(context);
                break;
            // Stage 2: Brand DNA
            case "brand_dna_feedback":
                this.onBrandDNAFeedback(context, event);
                break;
            case "lock_brand_dna":
                this.onLockBrandDNA(context);
                break;
            // Legacy alias kept for backward compatibility
            case "inspirations_rated":
                this.onInspirationsRated(context, event);
                break;
            case "screen_feedback":
                this.onScreenFeedback(context, event);
                break;
            case "variant_chat":
                this.onVariantChat(context, event);
                break;
            case "create_variant":
                this.onCreateVariant(context, event);
                break;
            case "complete_screen2":
                this.onCompleteScreen2(context);
                break;
            case "force_next_screen":
                this.handleForceNext(context);
                break;
            default:
                log(`Unknown event: ${event.name}`);
        }
    }

    // ==========================================
    // PHASE 1: INITIALIZATION
    // ==========================================

    private async onStartUIUXDesign(context: Context, event: Event): Promise<void> {
        log(`Starting UI/UX Design for ${context.projectId}`);

        // Verify Screen 1 artifacts exist
        const hasArtifacts = await this.verifyScreen1Artifacts(context);
        if (!hasArtifacts) {
            wsManager.sendMessage(context.projectId, {
                message: `❌ **Cannot start UI/UX Design**\n\nScreen 1 artifacts not found. Please complete Screen 1 first or ensure the following files exist:\n- \`docs/PRD.md\` or \`docs/project-vision.md\``
            });
            return;
        }

        // Initialize UIUXData if not present
        if (!context.planningData) {
            context.planningData = {
                currentScreen: 2,
                messages: [],
                confidence: 0
            };
        } else {
            context.planningData.currentScreen = 2;
        }

        if (!context.planningData.uiuxData) {
            context.planningData.uiuxData = createInitialUIUXData();
        }

        // Send welcome message
        wsManager.sendMessage(context.projectId, {
            message: `🎨 **Welcome to UI/UX Design!**\n\nLet's define your visual identity. I'll guide you through:\n\n1. **Mood Selection** - The overall feel of your app\n2. **Inspiration Gallery** - UI references to match your taste\n3. **Screen Previews** - Actual HTML/CSS designs\n4. **Design System** - Tokens and style guide\n\nLet me analyze your project first...`
        });

        wsManager.sendFiller(context.projectId, 'Analyzing project vision for mood recommendation...');

        // Start mood selection phase
        await this.startMoodPhase(context);
    }

    private async verifyScreen1Artifacts(context: Context): Promise<boolean> {
        const { fsManager } = await import("../../../fs");

        // Check for required Screen 1 files
        const requiredFiles = ['docs/PRD.md', 'docs/prd.md', 'docs/project-vision.md'];

        for (const file of requiredFiles) {
            if (fsManager.fileExists(context.projectId, file)) {
                log(`Found Screen 1 artifact: ${file}`);
                return true;
            }
        }

        log('No Screen 1 artifacts found');
        return false;
    }

    // ==========================================
    // PHASE 2: MOOD SELECTION
    // ==========================================

    private async startMoodPhase(context: Context): Promise<void> {
        try {
            const moodRecommendation = await analyzeMoodFromContext(context);

            // Send mood selection to client
            wsManager.broadcast(context.projectId, {
                type: "mood_selection",
                timestamp: new Date().toISOString(),
                data: {
                    message: moodRecommendation.message,
                    recommended: moodRecommendation.recommended,
                    reasoning: moodRecommendation.reasoning,
                    options: moodRecommendation.options
                }
            });

            log(`Mood recommendation sent: ${moodRecommendation.recommended}`);

        } catch (error: any) {
            log(`Error in mood phase: ${error.message}`);
            wsManager.sendMessage(context.projectId, {
                message: `❌ Error analyzing mood: ${error.message}. Please try again.`
            });
        }
    }

    private async onMoodSelected(context: Context, event: Event): Promise<void> {
        // Handle nested payload structure from WebSocket
        const payload = event.payload.payload || event.payload;
        const mood = payload.mood;
        log(`Mood selected: ${mood}`);

        await handleMoodSelected(context, mood);

        // NEW: Move to Brand Identity phase instead of inspiration
        wsManager.sendFiller(context.projectId, 'Generating Brand Identity...');
        await this.startBrandIdentityPhase(context);
    }

    // ==========================================
    // PHASE 3a: BRAND IDENTITY (strategic/abstract)
    // ==========================================

    private async startBrandIdentityPhase(context: Context): Promise<void> {
        log('[Phase 3a] Starting Brand Identity phase...');

        try {
            wsManager.sendFiller(context.projectId, 'Analyzing your project to define your brand identity...');

            const brandIdentity = await generateBrandIdentity(context);

            if (context.planningData?.uiuxData) {
                context.planningData.uiuxData.brandIdentity = brandIdentity;
                context.planningData.uiuxData.currentPhase = 'brand_identity';
            }

            // Send to client
            wsManager.broadcast(context.projectId, {
                type: "brand_identity_generated",
                timestamp: new Date().toISOString(),
                data: {
                    brandIdentity,
                    message: `🧬 **Brand Identity Defined**\n\nI've established your strategic brand foundation.\n\n**Archetype:** ${brandIdentity.archetype}\n**Energy:** ${brandIdentity.energyLevel.score}/10\n**Trust:** ${brandIdentity.trustLevel.score}/10\n\nReview the identity below. You can refine any aspect before locking it in. Once locked, I'll generate the exact design values.`
                }
            });

            log('[Phase 3a] Brand Identity generated and sent to client');

        } catch (error: any) {
            log(`Error in Brand Identity phase: ${error.message}`);
            wsManager.sendMessage(context.projectId, {
                message: `❌ Error generating Brand Identity: ${error.message}`
            });
        }
    }

    private async onBrandIdentityFeedback(context: Context, event: Event): Promise<void> {
        const payload = event.payload.payload || event.payload;
        const feedback = payload as BrandIdentityFeedback;

        log(`Brand Identity feedback: aspect=${feedback.aspect}`);

        try {
            wsManager.sendFiller(context.projectId, 'Refining Brand Identity...');

            const updated = await handleBrandIdentityFeedback(context, feedback);

            if (context.planningData?.uiuxData) {
                context.planningData.uiuxData.brandIdentity = updated;
            }

            wsManager.broadcast(context.projectId, {
                type: "brand_identity_updated",
                timestamp: new Date().toISOString(),
                data: {
                    brandIdentity: updated,
                    message: `✅ Brand Identity updated! Review the changes below.`
                }
            });

        } catch (error: any) {
            log(`Error handling Brand Identity feedback: ${error.message}`);
            wsManager.sendMessage(context.projectId, {
                message: `❌ Error refining Brand Identity: ${error.message}`
            });
        }
    }

    private async onLockBrandIdentity(context: Context): Promise<void> {
        log('[Phase 3a] Locking Brand Identity, advancing to Brand DNA...');

        try {
            await lockBrandIdentity(context);

            wsManager.sendMessage(context.projectId, {
                message: '✅ **Brand Identity Locked!**\n\nNow generating your Brand DNA — the exact design values from your identity...'
            });

            // Move to Brand DNA phase (Stage 2)
            await this.startBrandDNAPhase(context);

        } catch (error: any) {
            log(`Error locking Brand Identity: ${error.message}`);
            wsManager.sendMessage(context.projectId, {
                message: `❌ Error: ${error.message}`
            });
        }
    }

    // ==========================================
    // PHASE 3b: BRAND DNA (concrete/exact values)
    // ==========================================

    private async startBrandDNAPhase(context: Context): Promise<void> {
        log('[Phase 3b] Starting Brand DNA phase...');

        try {
            wsManager.sendFiller(context.projectId, 'Translating brand identity into exact design values...');

            const brandDNA = await generateBrandDNA(context);

            if (context.planningData?.uiuxData) {
                context.planningData.uiuxData.brandDNA = brandDNA;
                context.planningData.uiuxData.currentPhase = 'brand_dna';
            }

            wsManager.broadcast(context.projectId, {
                type: "brand_dna_generated",
                timestamp: new Date().toISOString(),
                data: {
                    brandDNA,
                    message: `🎨 **Brand DNA Generated**\n\nI've translated your brand identity into exact design values.\n\n**Primary Color:** ${brandDNA.color.primary}\n**Font:** ${brandDNA.typography.primary}\n**Mode:** ${brandDNA.color.mode}\n\nReview and refine any value. Once locked, these will govern every screen generated.`
                }
            });

            log('[Phase 3b] Brand DNA generated and sent to client');

        } catch (error: any) {
            log(`Error in Brand DNA phase: ${error.message}`);
            wsManager.sendMessage(context.projectId, {
                message: `❌ Error generating Brand DNA: ${error.message}`
            });
        }
    }

    private async onBrandDNAFeedback(context: Context, event: Event): Promise<void> {
        const payload = event.payload.payload || event.payload;
        const feedback = payload as BrandDNAFeedback;

        log(`Brand DNA feedback: aspect=${feedback.aspect}`);

        try {
            wsManager.sendFiller(context.projectId, 'Refining Brand DNA...');

            const updated = await handleBrandDNAFeedback(context, feedback);

            if (context.planningData?.uiuxData) {
                context.planningData.uiuxData.brandDNA = updated;
            }

            wsManager.broadcast(context.projectId, {
                type: "brand_dna_updated",
                timestamp: new Date().toISOString(),
                data: {
                    brandDNA: updated,
                    message: `✅ Brand DNA updated! Review the changes below.`
                }
            });

        } catch (error: any) {
            log(`Error handling Brand DNA feedback: ${error.message}`);
            wsManager.sendMessage(context.projectId, {
                message: `❌ Error refining Brand DNA: ${error.message}`
            });
        }
    }

    private async onLockBrandDNA(context: Context): Promise<void> {
        log('[Phase 3b] Locking Brand DNA, advancing to Inspiration...');

        try {
            await lockBrandDNA(context);

            wsManager.sendMessage(context.projectId, {
                message: '✅ **Brand DNA Locked!**\n\nMoving to inspiration gallery — I\'ll filter references to match your brand archetype...'
            });

            // Move to inspiration phase
            await this.startInspirationPhase(context);

        } catch (error: any) {
            log(`Error locking Brand DNA: ${error.message}`);
            wsManager.sendMessage(context.projectId, {
                message: `❌ Error: ${error.message}`
            });
        }
    }

    // ==========================================
    // PHASE 4: INSPIRATION GALLERY
    // ==========================================

    private async startInspirationPhase(context: Context): Promise<void> {
        try {
            const inspirations = await searchInspirations(context);

            // Send inspiration gallery to client
            wsManager.broadcast(context.projectId, {
                type: "inspiration_gallery",
                timestamp: new Date().toISOString(),
                data: {
                    message: `I found ${inspirations.length} UI inspirations that match your **${context.planningData?.uiuxData?.mood}** mood. Rate them to help me understand your taste!`,
                    items: inspirations,
                    instructions: "Mark your favorites ❤️ and reject ❌ any you dislike. I'll analyze your preferences."
                }
            });

            log(`Sent ${inspirations.length} inspirations`);

        } catch (error: any) {
            log(`Error in inspiration phase: ${error.message}`);
            wsManager.sendMessage(context.projectId, {
                message: `❌ Error finding inspirations: ${error.message}. Moving to screen generation...`
            });
            // Continue to screen phase even on error
            await this.startScreenPhase(context);
        }
    }

    private async onInspirationsRated(context: Context, event: Event): Promise<void> {
        // Handle nested payload structure from WebSocket
        const payload = event.payload.payload || event.payload;
        const ratings = payload.ratings || [];
        log(`Received inspiration ratings: ${ratings.length} items`);

        await handleInspirationsRated(context, ratings);

        // Move to screen generation phase
        wsManager.sendFiller(context.projectId, 'Analyzing your taste patterns...');
        await this.startScreenPhase(context);
    }

    // ==========================================
    // PHASE 5: SCREEN GENERATION (PARALLEL)
    // ==========================================

    private async startScreenPhase(context: Context): Promise<void> {
        try {
            // First, identify key screens from PRD
            const keyScreens = await identifyKeyScreens(context);

            if (!context.planningData?.uiuxData) return;
            context.planningData.uiuxData.keyScreens = keyScreens;

            wsManager.sendMessage(context.projectId, {
                message: `📱 I identified **${keyScreens.length} key screens** for your project:\n\n${keyScreens.map((s: KeyScreen, i: number) => `${i + 1}. **${s.name}** - ${s.description}`).join('\n')}\n\n⚡ **Generating all designs in parallel for faster results...**`
            });

            wsManager.sendFiller(context.projectId, `Generating ${keyScreens.length} screens in parallel...`);

            // Send skeleton loading state to client
            // REMOVED: screen_preview_loading - we now send per-variant loading states via variant_slot_reserved


            // Generate ALL screens in parallel
            await this.generateAllScreensParallel(context, keyScreens);

        } catch (error: any) {
            log(`Error in screen phase: ${error.message}`);
            wsManager.sendMessage(context.projectId, {
                message: `❌ Error identifying screens: ${error.message}`
            });
        }
    }

    private async generateAllScreensParallel(context: Context, keyScreens: KeyScreen[]): Promise<void> {
        const uiuxData = context.planningData?.uiuxData;
        if (!uiuxData) return;

        const totalVariants = keyScreens.length * 3;
        log(`Starting TRUE parallel generation: ${keyScreens.length} screens × 3 = ${totalVariants} variants`);

        try {
            // Generate ALL variants in TRUE parallel
            // Each variant emits variant_slot_reserved upfront, then screen_preview_single as it completes
            const allVariants = await generateAllVariantsParallel(context, keyScreens);

            // Store all variants (dedup by screenName + variant to prevent cache-hit duplication)
            allVariants.forEach(newVariant => {
                const existingIndex = uiuxData.screenVariants.findIndex(v =>
                    v.screenName === newVariant.screenName &&
                    v.variant === newVariant.variant
                );
                if (existingIndex !== -1) {
                    uiuxData.screenVariants[existingIndex] = newVariant;
                } else {
                    uiuxData.screenVariants.push(newVariant);
                }
            });

            // Send completion message
            wsManager.broadcast(context.projectId, {
                type: "screen_preview_complete",
                timestamp: new Date().toISOString(),
                data: {
                    totalScreens: keyScreens.length,
                    totalVariants: allVariants.length,
                    message: `🎉 **All ${keyScreens.length} screens generated!** (${allVariants.length} variants total)`
                }
            });

            wsManager.sendMessage(context.projectId, {
                message: `✅ Generated **${keyScreens.length} screens** with ${allVariants.length} total variants!\n\nReview the options above and select your favorites. Once you're happy with all screens, I'll extract the design tokens and create your style guide.`
            });

            log(`Parallel generation complete: ${keyScreens.length} screens, ${allVariants.length} variants`);

        } catch (error: any) {
            log(`Error in parallel generation: ${error.message}`);
            wsManager.sendMessage(context.projectId, {
                message: `❌ Error generating screens: ${error.message}`
            });
        }
    }

    private async onScreenFeedback(context: Context, event: Event): Promise<void> {
        // Handle nested payload structure from WebSocket
        const payload = event.payload.payload || event.payload;
        const feedback = payload as ScreenFeedback;

        // Fallback: Check for 'variant' property if selectedVariant is missing
        if (!feedback.selectedVariant && (payload as any).variant) {
            feedback.selectedVariant = (payload as any).variant;
        }

        log(`DEBUG FEEDBACK: ${JSON.stringify(feedback, null, 2)}`);
        log(`Screen feedback received: ${feedback.action} for ${feedback.screenType}`);

        // Sanitize selectedVariant
        if (feedback.selectedVariant) {
            const match = feedback.selectedVariant.match(/([ABC])/);
            if (match) {
                feedback.selectedVariant = match[0] as any;
            }
        }

        const result = await handleScreenFeedback(context, feedback);

        if (result.needsRegeneration) {
            // Regenerate with feedback — generateScreenVariants emits screen_preview_single progressively
            const uiuxData = context.planningData?.uiuxData;
            if (uiuxData) {
                // Find the screen to regenerate based on feedback.screenName
                // Fallback to current screen if not found (legacy behavior)
                const targetScreen = uiuxData.keyScreens.find(s => s.name === feedback.screenName)
                    || uiuxData.keyScreens[uiuxData.currentScreenIndex];

                if (targetScreen) {
                    wsManager.sendFiller(context.projectId, `Regenerating ${targetScreen.name} ${feedback.selectedVariant ? `Variant ${feedback.selectedVariant}` : '(All Variants)'} with your feedback...`);

                    if (feedback.action === 'regenerate' && !feedback.selectedVariant) {
                        log('WARNING: Regeneration requested without selectedVariant. Regenerating ALL variants.');
                    }

                    const variants = await generateScreenVariants(context, targetScreen, feedback.feedback, feedback.selectedVariant);

                    // Replace existing variants instead of appending
                    variants.forEach(newVariant => {
                        const existingIndex = uiuxData.screenVariants.findIndex(v =>
                            v.screenName === newVariant.screenName &&
                            v.variant === newVariant.variant
                        );

                        if (existingIndex !== -1) {
                            uiuxData.screenVariants[existingIndex] = newVariant;
                        } else {
                            uiuxData.screenVariants.push(newVariant);
                        }
                    });

                    wsManager.sendMessage(context.projectId, {
                        message: `✅ Regenerated **${targetScreen.name}** ${feedback.selectedVariant ? `Variant ${feedback.selectedVariant}` : ''}!`
                    });
                } else {
                    log(`Could not find screen to regenerate: ${feedback.screenName}`);
                }
            }
        } else if (result.moveToNext) {
            // In parallel mode, check if all screens are selected
            const uiuxData = context.planningData?.uiuxData;
            if (uiuxData) {
                const totalScreens = uiuxData.keyScreens.length;
                const selectedCount = uiuxData.selectedScreens.length;

                wsManager.sendMessage(context.projectId, {
                    message: `✅ Screen selected!(${selectedCount} / ${totalScreens})`
                });

                // If all screens selected, move to token extraction
                if (selectedCount >= totalScreens) {
                    await this.startTokenExtractionPhase(context);
                }
            }
        }
    }

    // ==========================================
    // PHASE 6: DESIGN TOKEN EXTRACTION
    // ==========================================

    private async startTokenExtractionPhase(context: Context): Promise<void> {
        wsManager.sendFiller(context.projectId, 'Extracting design tokens from selected screens...');

        try {
            const tokens = await extractDesignTokens(context);

            if (context.planningData?.uiuxData) {
                context.planningData.uiuxData.designTokens = tokens;
                context.planningData.uiuxData.currentPhase = 'tokens';
            }

            wsManager.sendMessage(context.projectId, {
                message: `✅ ** Design tokens extracted! **\n\nI've captured your color palette, typography, spacing, and component styles. Now generating your complete style guide...`
            });

            // Generate style guide and complete Screen 2
            await this.completeScreen2(context);

        } catch (error: any) {
            log(`Error extracting tokens: ${error.message}`);
            wsManager.sendMessage(context.projectId, {
                message: `❌ Error extracting design tokens: ${error.message}`
            });
        }
    }

    // ==========================================
    // VARIANT CHAT - Contextual LLM Discussion
    // ==========================================

    private async onVariantChat(context: Context, event: Event): Promise<void> {
        const payload = event.payload.payload || event.payload;
        let { screenName, variant, message, mode, chatId } = payload;

        // Default to 'ask' if mode is not specified (backwards compatibility)
        if (!mode) {
            mode = 'ask';
            log(`[Warning] No mode specified, defaulting to 'ask' mode`);
        }

        if (!message || !screenName || !variant) {
            wsManager.sendMessage(context.projectId, {
                message: "❌ Missing required fields for variant chat."
            });
            return;
        }

        const uiuxData = context.planningData?.uiuxData;
        if (!uiuxData) {
            wsManager.sendMessage(context.projectId, {
                message: "❌ UI/UX data not initialized."
            });
            return;
        }

        // Find the specific variant
        const targetVariant = uiuxData.screenVariants.find(
            v => v.screenName === screenName && v.variant === variant
        );

        if (!targetVariant) {
            wsManager.sendMessage(context.projectId, {
                message: `❌ Variant ${variant} not found for ${screenName}.`
            });
            return;
        }

        log(`Variant chat [${mode}]: ${screenName} ${variant} - "${message}"`);

        try {
            // Import LLM utility
            const { callLLMWithLogging, safeJSONParse } = await import("./utils");

            // Handle based on mode
            if (mode === 'edit') {
                // EDIT MODE: Generate modified HTML
                wsManager.sendFiller(context.projectId, 'Applying your changes...');

                const editPrompt = `You are an expert UI/UX developer. The user has requested a change to a screen variant.

**Current HTML:**
\`\`\`html
${targetVariant.htmlContent}
\`\`\`

**User's requested change:** "${message}"

Generate the MODIFIED HTML with the change applied. Respond with JSON:
{
  "html": "<complete modified HTML>",
  "description": "Brief description of what was changed"
}

**Rules:**
- Keep the overall structure and responsive design intact
- Only modify what the user requested
- Ensure valid, complete HTML
- Maintain existing styles unless specifically asked to change them
- Keep the design consistent with the original mood and aesthetic`;

                const response = await callLLMWithLogging(
                    context.projectId,
                    `Variant Edit: ${screenName} ${variant}`,
                    [
                        { role: 'system', content: 'You are an expert UI/UX developer who modifies HTML based on user requests.' },
                        { role: 'user', content: editPrompt }
                    ],
                    { temperature: 0.7, max_tokens: 16000 }
                );

                // Parse LLM response
                const result = safeJSONParse<{ html: string; description: string }>(response.content, {
                    html: targetVariant.htmlContent, // Fallback to original
                    description: 'Failed to parse changes'
                });

                // Validate that we got HTML
                if (!result.html || result.html.length < 50) {
                    wsManager.sendMessage(context.projectId, {
                        message: `❌ Failed to generate valid HTML. Please try rephrasing your request.`
                    });
                    return;
                }

                // Push current content as a version before updating
                if (!targetVariant.versions) {
                    // First edit — save V1 (the original)
                    targetVariant.versions = [{
                        version: 1,
                        htmlContent: targetVariant.htmlContent,
                        cssContent: targetVariant.cssContent,
                        deviceScreens: targetVariant.deviceScreens,
                        description: targetVariant.description,
                        timestamp: new Date().toISOString()
                    }];
                    targetVariant.version = 1;
                }

                // Save current as previous version
                const prevVersion = targetVariant.version || 1;
                const newVersion = prevVersion + 1;

                // Push a new version entry
                targetVariant.versions.push({
                    version: newVersion,
                    htmlContent: result.html,
                    cssContent: '',
                    deviceScreens: {
                        mobile: { htmlContent: result.html, cssContent: '' },
                        tablet: { htmlContent: result.html, cssContent: '' },
                        pc: { htmlContent: result.html, cssContent: '' }
                    },
                    description: result.description,
                    timestamp: new Date().toISOString()
                });

                // Update current to latest
                targetVariant.htmlContent = result.html;
                targetVariant.description = result.description;
                targetVariant.version = newVersion;
                targetVariant.deviceScreens = {
                    mobile: { htmlContent: result.html, cssContent: '' },
                    tablet: { htmlContent: result.html, cssContent: '' },
                    pc: { htmlContent: result.html, cssContent: '' }
                };

                // Update variant in cache
                const { setCachedUIUXStage, UIUXCacheKey } = await import("./stageCache");
                setCachedUIUXStage(context, UIUXCacheKey.SCREEN_VARIANTS, uiuxData.screenVariants);

                log(`✅ Updated ${screenName} Variant ${variant} to V${newVersion} in memory + cache`);

                // Broadcast update to client with versions
                wsManager.broadcast(context.projectId, {
                    type: "variant_updated",
                    timestamp: new Date().toISOString(),
                    data: {
                        screenName,
                        variant,
                        htmlContent: result.html,
                        description: result.description,
                        version: newVersion,
                        versions: targetVariant.versions,
                        status: targetVariant.status
                    }
                });

                log(`Variant update broadcast for ${screenName} ${variant} (V${newVersion})`);

            } else {
                // ASK MODE: Conversational response with history
                wsManager.sendFiller(context.projectId, 'Analyzing variant...');

                const systemPrompt = `You are an expert UI/UX designer discussing a specific screen variant with a user.

The user is viewing and discussing:
- Screen: ${screenName}
- Variant: ${variant}
- Description: ${targetVariant.description}

Your role is to:
1. Answer questions about the current design
2. Provide insights on visual hierarchy, colors, layout, accessibility
3. Suggest modifications when requested
4. Help the user refine this specific variant

Be specific, actionable, and reference the actual HTML/CSS when relevant.`;

                const variantContext = `# Current Variant HTML
\`\`\`html
${targetVariant.htmlContent}
\`\`\`

The user wants to discuss this variant. Answer based on the HTML above.`;

                // Build messages: system + variant context + conversation history + current message
                const llmMessages: { role: string; content: string }[] = [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: variantContext },
                    { role: 'assistant', content: 'I can see the variant HTML. How can I help you with this design?' },
                ];

                // Load previous conversation from PostgreSQL
                if (chatId) {
                    try {
                        const { getMessages } = await import("../../../db/postgres");
                        const history = await getMessages(chatId);
                        for (const msg of history) {
                            const rawContent = typeof msg.content === 'string'
                                ? JSON.parse(msg.content)
                                : msg.content;
                            const text = typeof rawContent === 'string'
                                ? rawContent
                                : (rawContent.message || rawContent.content || JSON.stringify(rawContent));
                            llmMessages.push({ role: msg.role, content: text });
                        }
                    } catch (err: any) {
                        log(`Could not load chat history: ${err.message}`);
                    }
                }

                // Add current user message (not yet in DB — it was just saved by index.ts)
                // Check if last message in history is already this one to avoid duplication
                const lastMsg = llmMessages[llmMessages.length - 1];
                if (!(lastMsg.role === 'user' && lastMsg.content === message)) {
                    llmMessages.push({ role: 'user', content: message });
                }

                const response = await callLLMWithLogging(
                    context.projectId,
                    `Variant Chat: ${screenName} ${variant}`,
                    llmMessages,
                    { temperature: 0.7, max_tokens: 2000 }
                );

                // Send response back to client
                wsManager.broadcast(context.projectId, {
                    type: "variant_chat_response",
                    timestamp: new Date().toISOString(),
                    data: {
                        screenName,
                        variant,
                        message: response.content,
                        role: 'assistant',
                        chatId
                    }
                });

                // Persist assistant response to database
                if (chatId) {
                    saveMessage(chatId, 'assistant', response.content).catch(
                        err => log(`Failed to save assistant message: ${err.message}`)
                    );
                }

                log(`Variant chat response sent for ${screenName} ${variant}`);
            }

        } catch (error: any) {
            log(`Error in variant chat: ${error.message} `);
            wsManager.sendMessage(context.projectId, {
                message: `❌ Error: ${error.message} `
            });
        }
    }

    /**
     * Handle on-demand variant creation from the canvas editor.
     * User describes how the new variant should differ from the primary design.
     */
    private async onCreateVariant(context: Context, event: Event): Promise<void> {
        const payload = event.payload.payload || event.payload;
        const { screenName, description, referenceVariantId } = payload;

        if (!screenName || !description) {
            wsManager.sendMessage(context.projectId, { message: "❌ Screen name and description are required." });
            return;
        }

        try {
            const uiuxData = context.planningData?.uiuxData;
            if (!uiuxData) {
                wsManager.sendMessage(context.projectId, { message: "❌ No UI/UX data available." });
                return;
            }

            // Determine next variant label by counting existing variants for this screen
            const existingVariants = uiuxData.screenVariants.filter(
                (v: ScreenVariant) => v.screenName === screenName
            );
            const nextLabel = String.fromCharCode(65 + existingVariants.length); // A=65, B=66, C=67, ...

            // Look up reference variant HTML if provided
            let referenceHTML: string | undefined;
            if (referenceVariantId) {
                const refVariant = uiuxData.screenVariants.find(
                    (v: ScreenVariant) => v.id === referenceVariantId
                );
                if (refVariant) {
                    referenceHTML = refVariant.htmlContent;
                    log(`Using reference variant ${refVariant.variant} (${referenceVariantId})`);
                } else {
                    log(`Reference variant not found: ${referenceVariantId} `);
                }
            }

            log(`Creating on - demand variant ${nextLabel} for ${screenName}: "${description}"`);
            wsManager.sendLog(context.projectId, `🎨 Creating variant ${nextLabel} for ${screenName}...`);

            const variant = await generateOnDemandVariant(
                context, screenName, nextLabel, description, referenceHTML
            );

            if (variant) {
                // Add to the screen variants collection
                uiuxData.screenVariants.push(variant);
                log(`On - demand variant ${nextLabel} added for ${screenName}`);
            } else {
                wsManager.sendMessage(context.projectId, {
                    message: `❌ Failed to generate variant for ${screenName}.`
                });
            }

        } catch (error: any) {
            log(`Error creating variant: ${error.message} `);
            wsManager.sendMessage(context.projectId, {
                message: `❌ Error: ${error.message} `
            });
        }
    }



    private async completeScreen2(context: Context): Promise<void> {
        wsManager.sendFiller(context.projectId, 'Generating design system artifacts...');

        try {
            // Generate style guide
            await generateStyleGuide(context);

            // Generate all artifacts
            await generateScreen2Artifacts(context);

            if (context.planningData?.uiuxData) {
                context.planningData.uiuxData.currentPhase = 'complete';
                context.planningData.uiuxData.confidenceScore = 100;
            }

            // Broadcast completion
            wsManager.broadcast(context.projectId, {
                type: "screen2_complete",
                timestamp: new Date().toISOString(),
                data: {
                    message: "🎉 **UI/UX Design Complete!**\n\nYour design system is ready:\n- `ui - style - guide.md`\n- `design - tokens.json`\n- Selected screen previews\n- Inspiration gallery\n\nReady for Technical Research (Screen 3)!",
                    artifacts: context.artifacts,
                    confidence: 100
                }
            });

            log(`Screen 2 complete for ${context.projectId}`);

        } catch (error: any) {
            log(`Error completing Screen 2: ${error.message} `);
            wsManager.sendMessage(context.projectId, {
                message: `❌ Error generating artifacts: ${error.message} `
            });
        }
    }

    private async onCompleteScreen2(context: Context): Promise<void> {
        await this.completeScreen2(context);
    }

    private handleForceNext(context: Context): void {
        log(`Force next triggered for ${context.projectId
            }`);
        wsManager.sendMessage(context.projectId, {
            message: "⚠️ Forcing completion with current progress..."
        });
        this.completeScreen2(context);
    }
}
