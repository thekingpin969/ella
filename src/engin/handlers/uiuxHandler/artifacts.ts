// uiuxHandler/artifacts.ts
// Artifact generation for Screen 2

import { Context } from "../../types/context";
import { fsManager } from "../../../fs";
import { memoryService } from "../../../memory";
import { wsManager } from "../../../websocket/manager";
import { log, withRetry } from "./utils";
import { generateStyleGuide } from "./styleGuide";

interface Artifact {
    path: string;
    content: string;
}

/**
 * Generate all Screen 2 artifacts
 */
export async function generateScreen2Artifacts(context: Context): Promise<void> {
    log(`Generating Screen 2 artifacts for ${context.projectId}`);
    wsManager.sendFiller(context.projectId, 'Generating design system artifacts...');

    const uiuxData = context.planningData?.uiuxData;
    if (!uiuxData) {
        throw new Error('UIUXData not initialized');
    }

    try {
        // Initialize workspace if needed
        await fsManager.initializeProject(context.projectId);

        const artifacts: Artifact[] = [];

        // 1. UI Style Guide
        const styleGuide = await generateStyleGuide(context);
        artifacts.push({
            path: 'design/ui-style-guide.md',
            content: styleGuide
        });

        // 2. Design Tokens JSON
        if (uiuxData.designTokens) {
            artifacts.push({
                path: 'design/design-tokens.json',
                content: JSON.stringify(uiuxData.designTokens, null, 2)
            });
        }

        // 3. Inspiration Gallery JSON
        const inspirationGallery = {
            mood: uiuxData.mood,
            designSignature: uiuxData.tasteAnalysis?.designSignature,
            preferences: uiuxData.tasteAnalysis?.preferences,
            items: uiuxData.inspirations,
            favorites: uiuxData.inspirations.filter(i => i.userRating === 'favorite'),
            generatedAt: new Date().toISOString()
        };
        artifacts.push({
            path: 'design/inspiration-gallery.json',
            content: JSON.stringify(inspirationGallery, null, 2)
        });

        // 4. Approved Screens (HTML files)
        const approvedVariants = uiuxData.screenVariants.filter(v => v.status === 'approved');
        for (const variant of approvedVariants) {
            const filename = `${variant.screenType.toLowerCase().replace(/\s+/g, '-')}.html`;

            // Create complete HTML with embedded CSS
            const fullHTML = createCompleteHTML(variant.screenName, variant.htmlContent, variant.cssContent);

            artifacts.push({
                path: `design/approved-screens/${filename}`,
                content: fullHTML
            });
        }

        // 5. Screen 2 Summary
        const summary = createScreen2Summary(context);
        artifacts.push({
            path: 'design/screen2-summary.md',
            content: summary
        });

        // Save all artifacts
        for (const artifact of artifacts) {
            await withRetry(
                async () => {
                    await fsManager.writeFile(context.projectId, artifact.path, artifact.content);
                    // Sync to Drive if available
                    if (context.driveFolderId) {
                        await fsManager.syncToDrive(context.projectId, artifact.path, context.driveFolderId);
                    }
                },
                context.projectId,
                `Saving ${artifact.path}`
            );
            context.artifacts.push(artifact.path);
        }

        log(`Generated ${artifacts.length} artifacts for Screen 2`);

        wsManager.sendMessage(context.projectId, {
            message: `✅ **Design System Artifacts Generated:**\n\n${artifacts.map(a => `- \`${a.path}\``).join('\n')}`
        });

    } catch (error: any) {
        log(`Error generating artifacts: ${error.message}`);
        throw error;
    }
}

/**
 * Create complete HTML document with embedded CSS
 */
function createCompleteHTML(title: string, htmlContent: string, cssContent: string): string {
    // Check if HTML already has full structure
    if (htmlContent.includes('<!DOCTYPE html>') || htmlContent.includes('<html')) {
        // Already complete, just ensure CSS is included
        if (cssContent && !htmlContent.includes(cssContent.substring(0, 50))) {
            // Inject CSS into head
            return htmlContent.replace('</head>', `<style>\n${cssContent}\n</style>\n</head>`);
        }
        return htmlContent;
    }

    // Wrap in complete HTML structure
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | E.L.L.A Design</title>
    <style>
${cssContent}
    </style>
</head>
<body>
${htmlContent}
</body>
</html>`;
}

/**
 * Create Screen 2 summary document
 */
function createScreen2Summary(context: Context): string {
    const uiuxData = context.planningData?.uiuxData;
    if (!uiuxData) {
        return '# Screen 2 Summary\n\nNo data available.';
    }

    const approvedCount = uiuxData.approvedScreens.length;
    const totalScreens = uiuxData.keyScreens.length;

    return `# Screen 2: UI/UX Design Summary

> Generated by E.L.L.A for **${context.projectName}**
> Completed: ${new Date().toISOString()}

---

## ✅ Design Decisions

| Aspect | Choice |
|--------|--------|
| **Mood** | ${uiuxData.mood || 'Not set'} |
| **Mood Locked** | ${uiuxData.moodLocked ? '✅ Yes' : '❌ No'} |
| **Inspirations Reviewed** | ${uiuxData.inspirations.length} |
| **Screens Designed** | ${approvedCount}/${totalScreens} |
| **Confidence Score** | ${uiuxData.confidenceScore}% |

---

## 🎨 Design Signature

${uiuxData.tasteAnalysis?.designSignature || 'No taste analysis performed.'}

---

## 📱 Approved Screens

${uiuxData.approvedScreens.length > 0
            ? uiuxData.approvedScreens.map(s => `- ${s}`).join('\n')
            : 'No screens approved yet.'}

---

## 📦 Generated Artifacts

- \`design/ui-style-guide.md\` - Human-readable style guide
- \`design/design-tokens.json\` - Machine-readable tokens
- \`design/inspiration-gallery.json\` - Curated inspirations
- \`design/approved-screens/\` - HTML preview files

---

## ➡️ Next Steps

Screen 2 complete! Ready for **Screen 3: Technical Research**.

---

*Generated by E.L.L.A*
`;
}
