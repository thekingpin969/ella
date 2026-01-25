// planHandler/prdGenerator.ts
// Generates the final PRD document when confidence is met

import { Context } from "../../types/context";
import { log, callLLMWithLogging } from "./utils";
import { wsManager } from "../../../websocket/manager";
import { getProjectUnderstanding } from "./projectUnderstanding";
import { PROMPTS } from "../../prompts/prompts";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Generate the final PRD document
 */
export async function generatePRD(context: Context): Promise<void> {
    log('Generating PRD document...');
    wsManager.sendFiller(context.projectId, 'Generating your PRD document...');

    // 1. Get the complete project understanding
    const understanding = await getProjectUnderstanding(context);

    if (!understanding) {
        log('No project understanding found, cannot generate PRD');
        wsManager.sendMessage(context.projectId, {
            message: '❌ Cannot generate PRD - no project understanding found.'
        });
        return;
    }

    // 2. Generate PRD via LLM
    const prdContent = await generatePRDContent(context, understanding);

    // 3. Save to docs/prd.md
    await savePRD(context, prdContent);

    // 4. Notify user
    wsManager.sendMessage(context.projectId, {
        message: `✅ PRD Generated!\n\nYour Product Requirements Document has been saved to \`docs/prd.md\`.\n\nThe PRD contains:\n- Project overview\n- Features & requirements\n- Technical specifications\n- Success criteria\n- Implementation roadmap`
    });

    log('PRD generation complete');
}

/**
 * Generate PRD content from understanding using LLM
 */
async function generatePRDContent(
    context: Context,
    understanding: string
): Promise<string> {
    const response = await callLLMWithLogging(
        context.projectId,
        'PRD Generation',
        [
            { role: 'system', content: PROMPTS.PRD_GENERATION_PROMPT },
            { role: 'user', content: understanding }
        ],
        { temperature: 0.3, max_tokens: 8000 }
    );

    return response.content || '';
}

/**
 * Save PRD to file
 */
async function savePRD(context: Context, content: string): Promise<void> {
    const docsPath = path.join('./projects', context.projectId, 'docs');
    const prdPath = path.join(docsPath, 'prd.md');

    await fs.mkdir(docsPath, { recursive: true });
    await fs.writeFile(prdPath, content, 'utf-8');

    log(`Saved PRD to: ${prdPath}`);
}
