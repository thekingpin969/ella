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
            // Generate ALL variants in TRUE parallel (all N×3 at once)
            const allVariants = await generateAllVariantsParallel(context, keyScreens);

            // Store all variants
            uiuxData.screenVariants.push(...allVariants);

            // Group variants by screen for display
            const screenGroups = new Map<string, ScreenVariant[]>();
            allVariants.forEach(v => {
                const key = v.screenName;
                if (!screenGroups.has(key)) {
                    screenGroups.set(key, []);
                }
                screenGroups.get(key)!.push(v);
            });

            // Build screen previews
            const allScreenPreviews: any[] = [];
            keyScreens.forEach((screen, index) => {
                const variants = screenGroups.get(screen.name) || [];
                if (variants.length > 0) {
                    allScreenPreviews.push({
                        screenType: screen.type,
                        screenName: screen.name,
                        screenIndex: index + 1,
                        variants: variants.map((v: ScreenVariant) => ({
                            id: v.id,
                            variant: v.variant,
                            description: v.description,
                            htmlContent: v.htmlContent,
                            cssContent: v.cssContent
                        }))
                    });
                }
            });

            // Send ALL screen previews at once
            wsManager.broadcast(context.projectId, {
                type: "screen_preview",
                timestamp: new Date().toISOString(),
                data: {
                    mode: "batch",
                    totalScreens: keyScreens.length,
                    totalVariants: allVariants.length,
                    screens: allScreenPreviews,
                    message: `🎉 **All ${allScreenPreviews.length} screens generated!** (${allVariants.length} variants total)`
                }
            });

            wsManager.sendMessage(context.projectId, {
                message: `✅ Generated **${allScreenPreviews.length} screens** with ${allVariants.length} total variants!\n\nReview the options above and approve your favorites. Once you're happy with all screens, I'll extract the design tokens and create your style guide.`
            });

            log(`Parallel generation complete: ${allScreenPreviews.length} screens, ${allVariants.length} variants`);

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
        log(`Screen feedback received: ${feedback.action} for ${feedback.screenType}`);

        const result = await handleScreenFeedback(context, feedback);

        if (result.needsRegeneration) {
            // Regenerate with feedback
            const uiuxData = context.planningData?.uiuxData;
            if (uiuxData) {
                const currentScreen = uiuxData.keyScreens[uiuxData.currentScreenIndex];
                wsManager.sendFiller(context.projectId, `Regenerating ${currentScreen.name} with your feedback...`);

                const variants = await generateScreenVariants(context, currentScreen, feedback.feedback);
                uiuxData.screenVariants.push(...variants);

                wsManager.broadcast(context.projectId, {
                    type: "screen_preview",
                    timestamp: new Date().toISOString(),
                    data: {
                        screenType: currentScreen.type,
                        screenName: currentScreen.name,
                        variants: variants.map((v: ScreenVariant) => ({
                            id: v.id,
                            variant: v.variant,
                            description: v.description,
                            htmlContent: v.htmlContent,
                            cssContent: v.cssContent
                        })),
                        message: `Here are new options based on your feedback!`
                    }
                });
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

            // Generate style guide and complete
            await this.completeScreen2(context);

        } catch (error: any) {
            log(`Error extracting tokens: ${error.message}`);
            wsManager.sendMessage(context.projectId, {
                message: `❌ Error extracting design tokens: ${error.message}`
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
