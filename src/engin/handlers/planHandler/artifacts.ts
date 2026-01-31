// planHandler/artifacts.ts
// Artifact generation for screen completion

import { Context } from "../../types/context";
import { wsManager } from "../../../websocket/manager";
import { memoryService } from "../../../memory";
import { fsManager } from "../../../fs";
import { PROMPTS } from "../../prompts/prompts";
import { callLLMWithLogging, withRetry, log } from "./utils";
import { Artifact } from "./types";
import { getProjectUnderstanding } from "./projectUnderstanding";

/**
 * Complete Screen 1: Generate artifacts and transition
 */
export async function completeScreen1(
    context: Context,
    onScreenComplete: (context: Context, screenNumber: number) => void
): Promise<void> {
    log(`Completing Screen 1 for ${context.projectId}`);
    wsManager.sendFiller(context.projectId, 'Generating project artifacts...');

    try {
        // Initialize workspace if needed
        await fsManager.initializeProject(context.projectId);

        // Generate artifacts
        const artifacts = await generateScreen1Artifacts(context);

        // Save artifacts locally and sync to Drive
        for (const artifact of artifacts) {
            await withRetry(
                async () => {
                    await fsManager.writeFile(context.projectId, artifact.path, artifact.content);
                    await fsManager.syncToDrive(context.projectId, artifact.path, context.driveFolderId);
                },
                context.projectId,
                `Saving ${artifact.path}`
            );
            context.artifacts.push(artifact.path);
        }

        log(`Generated ${artifacts.length} artifacts for Screen 1`);

        // Trigger screen completion
        onScreenComplete(context, 1);

    } catch (error: any) {
        log(`Error completing Screen 1: ${error.message}`);
        wsManager.sendMessage(context.projectId, {
            message: `❌ Error generating artifacts: ${error.message}. Please try again.`
        });
    }
}

/**
 * Generate all Screen 1 artifacts
 */
export async function generateScreen1Artifacts(context: Context): Promise<Artifact[]> {
    const analysisStr = memoryService.getSession(context.projectId, 'initial_analysis');
    const analysis = analysisStr ? JSON.parse(analysisStr.content) : {};

    const artifacts: Artifact[] = [];

    // 1. Project Vision
    const projectVision = await withRetry(
        () => generateProjectVision(context, analysis),
        context.projectId,
        'Generating project vision'
    );
    artifacts.push({ path: 'docs/project-vision.md', content: projectVision });

    // 2. Context Analysis (JSON) - comprehensive gap and confidence tracking
    const contextAnalysis = {
        projectId: context.projectId,
        projectName: context.projectName,
        description: analysis.description || context.planningData?.initialDescription,
        // Gap tracking
        identifiedGaps: analysis.gaps || [],
        filledGaps: analysis.filledGaps || [],
        remainingGaps: analysis.remainingGaps || [],
        // Confidence tracking
        initialConfidence: analysis.initialConfidence,
        finalConfidence: analysis.confidence || context.planningData?.confidence,
        reasoning: analysis.reasoning,
        // Metadata
        generatedAt: new Date().toISOString(),
        screenNumber: 1,
        status: 'complete'
    };
    artifacts.push({
        path: 'docs/context-analysis.json',
        content: JSON.stringify(contextAnalysis, null, 2)
    });

    // 3. User Personas (if applicable)
    const userPersonas = await withRetry(
        () => generateUserPersonas(context, analysis),
        context.projectId,
        'Generating user personas'
    );
    if (userPersonas && !userPersonas.includes('N/A')) {
        artifacts.push({ path: 'docs/user-personas.md', content: userPersonas });
    }

    return artifacts;
}

/**
 * Generate project vision document using LLM
 */
async function generateProjectVision(context: Context, analysis: any): Promise<string> {
    // Get the full project understanding document
    const projectUnderstanding = await getProjectUnderstanding(context);

    // Combine full context with analysis summary
    const fullContext = `## Complete Project Understanding

${projectUnderstanding}

---

## Analysis Summary (for quick reference)

${JSON.stringify(analysis, null, 2)}`;

    const response = await callLLMWithLogging(
        context.projectId,
        'Generate Project Vision',
        [
            { role: 'system', content: PROMPTS.PROJECT_VISION_PROMPT },
            { role: 'user', content: fullContext }
        ],
        { temperature: 0.7, max_tokens: 2000 }
    );

    return response.content || '# Project Vision\n\nNo vision generated.';
}

/**
 * Generate user personas document using LLM
 */
async function generateUserPersonas(context: Context, analysis: any): Promise<string> {
    // Get the full project understanding document
    const projectUnderstanding = await getProjectUnderstanding(context);

    // Combine full context with analysis summary
    const fullContext = `## Complete Project Understanding

${projectUnderstanding}

---

## Analysis Summary (for quick reference)

${JSON.stringify(analysis, null, 2)}`;

    const response = await callLLMWithLogging(
        context.projectId,
        'Generate User Personas',
        [
            { role: 'system', content: PROMPTS.USER_PERSONAS_PROMPT },
            { role: 'user', content: fullContext }
        ],
        { temperature: 0.7, max_tokens: 1500 }
    );

    return response.content || '';
}
