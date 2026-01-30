// planHandler/projectUnderstanding.ts
// Manages the project understanding document - single source of truth

import { Context } from "../../types/context";
import { log } from "./utils";
import { wsManager } from "../../../websocket/manager";
import { fsManager } from "../../../fs";

/**
 * Get the path to project_understanding.md (relative to workspace)
 */
function getUnderstandingPath(): string {
    return 'docs/project_understanding.md';
}

/**
 * Create initial project understanding document
 */
export async function createProjectUnderstanding(
    context: Context,
    initialData: {
        description: string;
        analysis: string;
        gaps: string[];
        confidence: number;
    }
): Promise<void> {
    log('Creating project_understanding.md...');

    const timestamp = new Date().toISOString();

    const content = `# Project Understanding

> This document contains everything we know about the project.
> It grows with each interaction until we have enough to generate a complete PRD.

---

## Initial Description

${initialData.description}

---

## Initial Analysis

${initialData.analysis}

### Identified Gaps

${initialData.gaps.map(g => `- ${g}`).join('\n')}

### Initial Confidence: ${initialData.confidence}%

---

## Accumulated Knowledge

<!-- New information will be appended here -->

`;

    const filePath = getUnderstandingPath();
    await fsManager.writeFile(context.projectId, filePath, content);

    log(`Created: ${filePath}`);
    wsManager.sendLog(context.projectId, `Created project_understanding.md`);
}

/**
 * Update project understanding with new information
 * Simply appends new info - no complex merging
 */
export async function updateProjectUnderstanding(
    context: Context,
    newInfo: string,
    source: 'research' | 'user_answer' | 'analysis' = 'analysis'
): Promise<void> {
    log('Updating project_understanding.md...');

    const filePath = getUnderstandingPath();
    const timestamp = new Date().toLocaleString();

    const sourceLabel = {
        'research': '🔍 Research Findings',
        'user_answer': '💬 User Clarification',
        'analysis': '📊 Analysis Update'
    }[source];

    // Read existing content
    let existingContent = '';
    try {
        existingContent = await fsManager.readFile(context.projectId, filePath);
    } catch (error) {
        log('project_understanding.md not found, creating new one');
    }

    const appendContent = `
### ${sourceLabel} (${timestamp})

${newInfo}

---

`;

    // Append to existing content
    const newContent = existingContent + appendContent;
    await fsManager.writeFile(context.projectId, filePath, newContent);

    log(`Updated project_understanding.md with ${source}`);
}

/**
 * Get the full project understanding document
 */
export async function getProjectUnderstanding(context: Context): Promise<string> {
    const filePath = getUnderstandingPath();

    try {
        const content = await fsManager.readFile(context.projectId, filePath);
        return content;
    } catch (error) {
        log('project_understanding.md not found, returning empty');
        return '';
    }
}

/**
 * Check if project understanding exists
 */
export async function hasProjectUnderstanding(context: Context): Promise<boolean> {
    const filePath = getUnderstandingPath();
    return fsManager.fileExists(context.projectId, filePath);
}
