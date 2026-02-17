// uiuxHandler/index.ts
// Main UIUXHandler class - orchestrates Screen 2: UI/UX Deep Dive

import { BaseHandler } from "../BaseHandler";
import { Context } from "../../types/context";
import { Event } from "../../types/events";
import { wsManager } from "../../../websocket/manager";
import { memoryService } from "../../../memory";

// Import types
import { createInitialUIUXData, UIUXData, UIUX_CONFIDENCE_THRESHOLD, KeyScreen, ScreenVariant, ScreenFeedback } from "./types";
import { log } from "./utils";

// Import modules
import { analyzeMoodFromContext, handleMoodSelected } from "./mood";
import { searchInspirations, handleInspirationsRated } from "./inspiration";
import { identifyKeyScreens, generateScreenVariants, generateAllVariantsParallel, handleScreenFeedback } from "./screenGenerator";
import { extractDesignTokens } from "./designTokens";
import { generateStyleGuide } from "./styleGuide";
import { generateScreen2Artifacts } from "./artifacts";
import { generatePrototype } from "./prototypeGenerator";
import { refineCommonComponents } from "./componentRefiner";

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
            case "inspirations_rated":
                this.onInspirationsRated(context, event);
                break;
            case "screen_feedback":
                this.onScreenFeedback(context, event);
                break;
            case "variant_chat":
                this.onVariantChat(context, event);
                break;
            case "refine_components":
                this.onRefineComponents(context, event);
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

        // Move to inspiration phase
        wsManager.sendFiller(context.projectId, 'Searching for UI inspirations matching your mood...');
        await this.startInspirationPhase(context);
    }

    // ==========================================
    // PHASE 3: INSPIRATION GALLERY
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
    // PHASE 4: SCREEN GENERATION (PARALLEL)
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
                message: `✅ Generated **${keyScreens.length} screens** with ${allVariants.length} total variants!\n\nReview the options above and approve your favorites. Once you're happy with all screens, I'll extract the design tokens and create your style guide.`
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
            // In parallel mode, check if all screens are approved
            const uiuxData = context.planningData?.uiuxData;
            if (uiuxData) {
                const totalScreens = uiuxData.keyScreens.length;
                const approvedCount = uiuxData.approvedScreens.length;

                wsManager.sendMessage(context.projectId, {
                    message: `✅ Screen approved!(${approvedCount} / ${totalScreens})`
                });

                // If all screens approved, move to token extraction
                if (approvedCount >= totalScreens) {
                    await this.startTokenExtractionPhase(context);
                }
            }
        }
    }

    // ==========================================
    // PHASE 5: DESIGN TOKEN EXTRACTION
    // ==========================================

    private async startTokenExtractionPhase(context: Context): Promise<void> {
        wsManager.sendFiller(context.projectId, 'Extracting design tokens from approved screens...');

        try {
            const tokens = await extractDesignTokens(context);

            if (context.planningData?.uiuxData) {
                context.planningData.uiuxData.designTokens = tokens;
                context.planningData.uiuxData.currentPhase = 'tokens';
            }

            wsManager.sendMessage(context.projectId, {
                message: `✅ ** Design tokens extracted! **\n\nI've captured your color palette, typography, spacing, and component styles. Now generating your complete style guide...`
            });

            // Generate style guide and move to Prototype Phase
            // await this.completeScreen2(context); // OLD FLOW
            await this.startPrototypePhase(context); // NEW FLOW

        } catch (error: any) {
            log(`Error extracting tokens: ${error.message}`);
            wsManager.sendMessage(context.projectId, {
                message: `❌ Error extracting design tokens: ${error.message}`
            });
        }
    }

    // ==========================================
    // PHASE 5.5: PROTOTYPE & REFINEMENT
    // ==========================================

    private async startPrototypePhase(context: Context): Promise<void> {
        wsManager.sendFiller(context.projectId, 'Assembling interactive prototype...');

        try {
            const prototypeHTML = await generatePrototype(context);

            wsManager.broadcast(context.projectId, {
                type: "prototype_ready",
                timestamp: new Date().toISOString(),
                data: {
                    message: `🚀 **Prototype Ready!**\n\nI've assembled your screens into an interactive prototype. You can now:\n1. **Refine Components**: Make global changes (e.g., "Make navbar dark")\n2. **Complete Design**: Finalize Screen 2`,
                    url: 'design/prototype.html',
                    htmlContent: prototypeHTML
                }
            });

            if (context.planningData?.uiuxData) {
                context.planningData.uiuxData.currentPhase = 'prototype';
            }

        } catch (error: any) {
            log(`Error generating prototype: ${error.message}`);
            wsManager.sendMessage(context.projectId, {
                message: `⚠️ Error generating prototype: ${error.message}. You can still complete the stage.`
            });
        }
    }

    // ==========================================
    // VARIANT CHAT - Contextual LLM Discussion
    // ==========================================

    private async onVariantChat(context: Context, event: Event): Promise<void> {
        const payload = event.payload.payload || event.payload;
        let { screenName, variant, message, mode } = payload;

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

                // Update variant in memory
                targetVariant.htmlContent = result.html;
                targetVariant.description = result.description;
                targetVariant.deviceScreens = {
                    mobile: { htmlContent: result.html, cssContent: '' },
                    tablet: { htmlContent: result.html, cssContent: '' },
                    pc: { htmlContent: result.html, cssContent: '' }
                };

                // Update variant in cache
                const { setCachedUIUXStage, UIUXCacheKey } = await import("./stageCache");
                setCachedUIUXStage(context, UIUXCacheKey.SCREEN_VARIANTS, uiuxData.screenVariants);

                log(`✅ Updated ${screenName} Variant ${variant} in memory + cache`);

                // Broadcast update to client
                wsManager.broadcast(context.projectId, {
                    type: "variant_updated",
                    timestamp: new Date().toISOString(),
                    data: {
                        screenName,
                        variant,
                        htmlContent: result.html,
                        description: result.description
                    }
                });

                // Also send confirmation message
                wsManager.sendMessage(context.projectId, {
                    message: `✅ **Updated!** ${result.description}`
                });

                log(`Variant update broadcast for ${screenName} ${variant}`);

            } else {
                // ASK MODE: Conversational response (original behavior)
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

# User Question/Request
${message}`;

                const response = await callLLMWithLogging(
                    context.projectId,
                    `Variant Chat: ${screenName} ${variant}`,
                    [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: variantContext }
                    ],
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
                        role: 'assistant'
                    }
                });

                log(`Variant chat response sent for ${screenName} ${variant}`);
            }

        } catch (error: any) {
            log(`Error in variant chat: ${error.message}`);
            wsManager.sendMessage(context.projectId, {
                message: `❌ Error: ${error.message}`
            });
        }
    }

    private async onRefineComponents(context: Context, event: Event): Promise<void> {
        const payload = event.payload.payload || event.payload;
        const instructions = payload.instructions;

        if (!instructions) {
            wsManager.sendMessage(context.projectId, { message: "❌ No refinement instructions provided." });
            return;
        }

        try {
            if (context.planningData?.uiuxData) {
                context.planningData.uiuxData.currentPhase = 'refinement';
            }

            await refineCommonComponents(context, instructions);

            // Re-generate prototype with updates
            await this.startPrototypePhase(context);

        } catch (error: any) {
            log(`Error refining components: ${error.message}`);
            wsManager.sendMessage(context.projectId, {
                message: `❌ Error during refinement: ${error.message}`
            });
        }
    }

    // ==========================================
    // PHASE 6: COMPLETION
    // ==========================================

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
                    message: "🎉 **UI/UX Design Complete!**\n\nYour design system is ready:\n- `ui-style-guide.md`\n- `design-tokens.json`\n- Approved screen previews\n- Inspiration gallery\n\nReady for Technical Research (Screen 3)!",
                    artifacts: context.artifacts,
                    confidence: 100
                }
            });

            log(`Screen 2 complete for ${context.projectId}`);

        } catch (error: any) {
            log(`Error completing Screen 2: ${error.message}`);
            wsManager.sendMessage(context.projectId, {
                message: `❌ Error generating artifacts: ${error.message}`
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
