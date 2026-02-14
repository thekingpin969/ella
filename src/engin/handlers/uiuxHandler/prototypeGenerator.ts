// uiuxHandler/prototypeGenerator.ts
import { Context } from "../../types/context";
import { fsManager } from "../../../fs";
import { wsManager } from "../../../websocket/manager";
import { callLLMWithLogging, log, safeJSONParse, cleanHTML } from "./utils";
import { setCachedUIUXStage, UIUXCacheKey } from "./stageCache";
import { PROMPTS } from "../../prompts/prompts";

/**
 * Generate a navigable HTML prototype from approved screens
 */
export async function generatePrototype(context: Context): Promise<string> {
    log(`Generating prototype for ${context.projectId}...`);
    wsManager.sendLog(context.projectId, "🔗 Assembling interactive prototype...");

    const uiuxData = context.planningData?.uiuxData;
    if (!uiuxData || !uiuxData.screenVariants) {
        throw new Error("No screen variants to prototype");
    }

    // Filter only approved variants
    const approvedVariants = uiuxData.screenVariants.filter(v => v.status === 'approved');

    // If no approved variants (edge case), use the last generated ones for each type
    const variantsToUse = approvedVariants.length > 0
        ? approvedVariants
        : uiuxData.keyScreens.map(k => {
            // Find last generated variant for this screen
            return uiuxData.screenVariants.filter(v => v.screenType === k.type).pop();
        }).filter(v => v); // Remove undefined

    if (variantsToUse.length === 0) {
        throw new Error("No screens available for prototype");
    }

    // prompt LLM to generate the container HTML
    // We want a simple "shell" that loads these screens or links between them.
    // For simplicity V1: A dashboard index page that links to all screens.
    // Enhanced V1: A unified single-page-app simulation using iframes or div-swapping.

    // Let's create a simple "Prototype Container" that lists screens and allows navigation.
    // Actually, the user asked for "navigable prototype".
    // We can ask the LLM to generate a `prototype.html` that contains:
    // 1. A Sidebar/Navbar (generated from common patterns)
    // 2. A content area that loads the screen HTMLs

    const screenSummary = variantsToUse.map(v => ({
        name: v!.screenName,
        type: v!.screenType,
        id: v!.id
    }));

    const prompt = `
    You are a UI Prototype Assembler.
    I have ${screenSummary.length} HTML screens: ${screenSummary.map(s => s.name).join(', ')}.
    
    Generate a "Master Prototype" HTML file that:
    1. Acts as a container for these screens.
    2. Includes a sticky sidebar or top navigation menu linking to each screen.
    3. Uses basic JavaScript to swap the visible content (or iframe) when a link is clicked.
    4. Is styled consistently with a neutral, professional dark/light mode wrapper.
    
    The screens will be available as separate HTML files in the same directory.
    - Screen filenames: \`screens/{screen_type}.html\` matches the screen names.
    
    Produce ONLY the HTML code for \`prototype.html\`.
    `;

    const response = await callLLMWithLogging(
        context.projectId,
        "Generate Prototype Container",
        [{ role: "user", content: prompt }],
        { temperature: 0.5 }
    );

    const prototypeHTML = cleanHTML(response.content);

    // Save prototype file
    await fsManager.writeFile(context.projectId, 'design/prototype.html', prototypeHTML);

    // Ensure individual screens are saved as HTML files for the prototype to link/load
    // (They might be saved later in artifacts, but we need them now for the prototype to work relative to them)
    // We'll assume the client handles the rendering via the blob/websocket content, BUT 
    // for a valid "prototype.html" artifact, the files need to exist on disk.

    // We will save them in `design/screens/`
    for (const v of variantsToUse) {
        if (v) {
            await fsManager.writeFile(context.projectId, `design/screens/${v.screenType}.html`, v.htmlContent);
        }
    }

    log("Prototype generated and screens saved.");

    if (context.planningData?.uiuxData) {
        context.planningData.uiuxData.prototypeData = {
            url: 'design/prototype.html',
            structure: screenSummary,
            status: 'generated'
        };
    }

    return prototypeHTML;
}
