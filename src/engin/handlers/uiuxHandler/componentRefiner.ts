// uiuxHandler/componentRefiner.ts
import { Context } from "../../types/context";
import { wsManager } from "../../../websocket/manager";
import { callLLMWithLogging, log, safeJSONParse, cleanHTML } from "./utils";

/**
 * Refine common components (Header, Footer, Nav) based on user instructions
 * and update ALL approved screens.
 */
export async function refineCommonComponents(
    context: Context,
    instructions: string
): Promise<void> {
    log(`Refining components for ${context.projectId}: "${instructions}"`);
    wsManager.sendLog(context.projectId, `🛠️ Refining components: "${instructions}"...`);

    const uiuxData = context.planningData?.uiuxData;
    if (!uiuxData || !uiuxData.screenVariants) {
        throw new Error("No screens to refine");
    }

    // Get all approved variants
    const approvedVariants = uiuxData.screenVariants.filter(v => v.status === 'approved');
    if (approvedVariants.length === 0) return;

    // 1. Analyze what actually needs changing
    // We'll take a sample screen (e.g. Dashboard) and the instructions
    const sampleVariant = approvedVariants[0];

    const analysisPrompt = `
    I have a screen with this HTML:
    \`\`\`html
    ${sampleVariant.htmlContent.substring(0, 1000)}... (truncated)
    \`\`\`
    
    User Request: "${instructions}"
    
    Task:
    1. Identify which common components (Navbar, Header, Footer, Sidebar, Buttons) correspond to this request.
    2. Generate the NEW HTML/CSS for *just* those changed components.
    3. Provide a clear CSS selector to target them.
    
    Return JSON:
    {
        "affectedComponents": ["navbar", "button"],
        "cssSelector": "nav.main-nav",
        "newHTML": "...html code...",
        "newCSS": "...css code..."
    }
    `;

    const analysisResponse = await callLLMWithLogging(
        context.projectId,
        "Analyze Component Refinement",
        [{ role: "user", content: analysisPrompt }],
        { temperature: 0.2 }
    );

    const analysis = safeJSONParse(analysisResponse.content, {
        affectedComponents: [],
        cssSelector: '',
        newHTML: '',
        newCSS: ''
    });

    if (!analysis.cssSelector || !analysis.newHTML) {
        wsManager.sendLog(context.projectId, "⚠️ Could not identify components to change.");
        return;
    }

    // 2. Apply changes to ALL approved screens
    // We will use a "smart replace" approach. Valid HTML parsing is expensive/complex here,
    // so we might ask LLM to do the replacement OR use regex if the selector is clean.
    // Given the complexity of HTML, we'll ask LLM to "Apply this change to this HTML" for each screen.
    // To speed it up, we do it in parallel.

    await Promise.all(approvedVariants.map(async (variant) => {
        const applyPrompt = `
        Apply this component update to the full screen HTML.
        
        Original HTML:
        ${variant.htmlContent}
        
        Update Instructions:
        Replace the element matching "${analysis.cssSelector}" with:
        ${analysis.newHTML}
        
        Also append this CSS to the <style>:
        ${analysis.newCSS}
        
        Return ONLY the full updated HTML.
        `;

        const applyResponse = await callLLMWithLogging(
            context.projectId,
            `Apply Refinement to ${variant.screenName}`,
            [{ role: "user", content: applyPrompt }],
            { temperature: 0.1, max_tokens: 16000 }
        );

        const newHtml = cleanHTML(applyResponse.content);
        if (newHtml && newHtml.length > 100) {
            variant.htmlContent = newHtml;
            // Also update the description to note the change
            variant.description += ` (Refined: ${instructions.substring(0, 20)}...)`;
        }
    }));

    // Register the action
    if (!uiuxData.refinementData) {
        uiuxData.refinementData = { commonComponents: [], history: [] };
    }
    uiuxData.refinementData.history.push({
        timestamp: new Date().toISOString(),
        instruction: instructions,
        affectedComponents: analysis.affectedComponents
    });

    wsManager.sendMessage(context.projectId, {
        message: `✅ **Components Refined!**\n\nUpdated ${analysis.affectedComponents.join(', ')} across all screens.`
    });
}
