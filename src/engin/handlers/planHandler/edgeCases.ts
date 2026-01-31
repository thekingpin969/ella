// planHandler/edgeCases.ts
// Edge case handlers: override, abort, and special scenarios

import { Context } from "../../types/context";
import { Event } from "../../types/events";
import { wsManager } from "../../../websocket/manager";
import { memoryService } from "../../../memory";
import { log, callLLMWithLogging } from "./utils";
import { generatePRD } from "./prdGenerator";

/**
 * Handle user override (force next screen at low confidence)
 */
export async function handleUserOverride(
    context: Context,
    event: Event,
    completeScreen1: (context: Context) => Promise<void>
): Promise<void> {
    const { force } = event.payload || {};

    if (force === true) {
        const confidence = context.planningData?.confidence || 0;
        log(`User forcing screen completion at ${confidence}% confidence`);

        wsManager.sendMessage(context.projectId, {
            message: `⚠️ Proceeding with ${confidence}% confidence. Some implementation details may require clarification later.`
        });

        await completeScreen1(context);
    } else {
        wsManager.sendMessage(context.projectId, {
            message: 'To force proceed, please confirm with force:true in your request.'
        });
    }
}

/**
 * Handle abort/restart planning
 */
export async function handleAbort(context: Context): Promise<void> {
    log(`Aborting planning for ${context.projectId}`);

    // Clear all session memory for this project
    memoryService.clearSession(context.projectId);

    // Reset planning data
    if (context.planningData) {
        context.planningData.currentScreen = 1;
        context.planningData.confidence = 0;
        context.planningData.messages = [];
        context.planningData.clarificationRound = 0;
        context.planningData.askedQuestionIds = [];
    }

    // Clear artifacts
    context.artifacts = [];

    wsManager.sendMessage(context.projectId, {
        message: '🔄 Planning session reset. You can start over with a new description.'
    });

    wsManager.broadcast(context.projectId, {
        type: 'update',
        timestamp: new Date().toISOString(),
        data: {
            message: 'Planning session reset',
            reset: true
        }
    });
}

/**
 * Handle user message from WebSocket
 * Supports:
 * 1. Override commands (skip to next stage)
 * 2. General questions to the planner (LLM chat)
 */
export async function handleUserMessage(
    context: Context,
    userMessage: string
): Promise<void> {
    // Safeguard against undefined or empty messages
    if (!userMessage || typeof userMessage !== 'string') {
        log('Invalid user message received:', userMessage);
        wsManager.sendMessage(context.projectId, {
            message: "I couldn't understand your message. Please try again."
        });
        return;
    }

    log(`User message received: "${userMessage}"`);
    wsManager.sendLog(context.projectId, 'Processing user message...', { message: userMessage });

    // Check for override commands
    const overrideKeywords = ['override', 'skip', 'force next', 'move to next', 'proceed', 'continue anyway', 'next stage', 'next screen'];
    const lowerMessage = userMessage.toLowerCase();

    const isOverrideCommand = overrideKeywords.some(keyword => lowerMessage.includes(keyword));

    if (isOverrideCommand) {
        await handleOverrideCommand(context);
        return;
    }

    // Otherwise, treat as a question to the planner
    await handlePlannerChat(context, userMessage);
}

/**
 * Handle override command - force screen progression
 */
async function handleOverrideCommand(context: Context): Promise<void> {
    const confidence = context.planningData?.confidence || 0;
    log(`User requested override at ${confidence}% confidence`);

    wsManager.sendMessage(context.projectId, {
        message: `⚠️ Proceeding with ${confidence}% confidence. Some implementation details may require clarification later.`
    });

    // Generate PRD with current understanding
    wsManager.sendFiller(context.projectId, 'generating PRD with current understanding...');

    try {
        await generatePRD(context);

        wsManager.sendMessage(context.projectId, {
            message: `✅ PRD generated! Moving to next stage.`
        });

        // Broadcast screen completion
        wsManager.broadcast(context.projectId, {
            type: "screen_complete",
            timestamp: new Date().toISOString(),
            data: {
                completedScreen: 1,
                nextScreen: 2,
                artifacts: context.artifacts,
                overrideConfidence: confidence
            }
        });

        // Update context
        if (context.planningData) {
            context.planningData.currentScreen = 2;
        }
    } catch (error: any) {
        log(`Error generating PRD on override: ${error.message}`);
        wsManager.sendMessage(context.projectId, {
            message: `❌ Failed to generate PRD: ${error.message}. Please try again.`
        });
    }
}

/**
 * Handle chat with the planner - LLM responds with project context
 */
async function handlePlannerChat(
    context: Context,
    userMessage: string
): Promise<void> {
    log('Handling planner chat...');
    wsManager.sendFiller(context.projectId, 'thinking...');

    // Get project context from session memory
    const initialAnalysisStr = memoryService.getSession(context.projectId, 'initial_analysis');
    let projectContext = '';

    if (initialAnalysisStr) {
        try {
            const analysis = JSON.parse(initialAnalysisStr.content);
            projectContext = `
Current Project Understanding:
- Description: ${analysis.description || 'Not available'}
- Confidence: ${analysis.confidence || 0}%
- Identified Gaps: ${JSON.stringify(analysis.gaps || [], null, 2)}
- Filled Gaps: ${JSON.stringify(analysis.filledGaps || [], null, 2)}
`;
        } catch (e) {
            log('Failed to parse initial analysis');
        }
    }

    const systemPrompt = `You are E.L.L.A (Even Logic Loves Automation), an AI project planning assistant.

You are currently in the PLANNING phase, helping the user define their project requirements.

${projectContext}

Current screen: ${context.planningData?.currentScreen || 1} of 3
Current confidence: ${context.planningData?.confidence || 0}%

INSTRUCTIONS:
1. Answer questions about the project planning process
2. Help clarify requirements and provide suggestions
3. If the user asks about gaps, explain what information is still needed
4. Be helpful, concise, and professional
5. Keep responses under 200 words unless more detail is needed

If the user wants to skip the current stage or force-proceed:
- Remind them they can say "override" or "skip" to proceed with current confidence
- Explain that lower confidence may result in more clarifications needed later`;

    try {
        const response = await callLLMWithLogging(
            context.projectId,
            "Planner Chat",
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            { temperature: 0.7, max_tokens: 1000 }
        );

        if (response.content) {
            wsManager.sendMessage(context.projectId, {
                message: response.content
            });
        } else {
            wsManager.sendMessage(context.projectId, {
                message: "I'm sorry, I couldn't process that. Could you rephrase your question?"
            });
        }
    } catch (error: any) {
        log(`Error in planner chat: ${error.message}`);
        wsManager.sendMessage(context.projectId, {
            message: `Sorry, I encountered an error: ${error.message}. Please try again.`
        });
    }
}
