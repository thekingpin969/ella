// planHandler/projectUnderstanding.ts
// Manages the project understanding document - single source of truth

import { Context } from "../../types/context";
import { log } from "./utils";
import { wsManager } from "../../../websocket/manager";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Get the path to the project's docs directory
 */
function getDocsPath(context: Context): string {
    // Use project ID to create a consistent path for docs
    return path.join('./projects', context.projectId, 'docs');
}

/**
 * Get the path to project_understanding.md
 */
function getUnderstandingPath(context: Context): string {
    return path.join(getDocsPath(context), 'project_understanding.md');
}

/**
 * Ensure docs directory exists
 */
async function ensureDocsDir(context: Context): Promise<void> {
    const docsPath = getDocsPath(context);
    await fs.mkdir(docsPath, { recursive: true });
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

    await ensureDocsDir(context);

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

    const filePath = getUnderstandingPath(context);
    await fs.writeFile(filePath, content, 'utf-8');

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

    const filePath = getUnderstandingPath(context);
    const timestamp = new Date().toLocaleString();

    const sourceLabel = {
        'research': '🔍 Research Findings',
        'user_answer': '💬 User Clarification',
        'analysis': '📊 Analysis Update'
    }[source];

    const appendContent = `
### ${sourceLabel} (${timestamp})

${newInfo}

---

`;

    // Append to existing file
    await fs.appendFile(filePath, appendContent, 'utf-8');

    log(`Updated project_understanding.md with ${source}`);
}

/**
 * Get the full project understanding document
 */
export async function getProjectUnderstanding(context: Context): Promise<string> {
    const filePath = getUnderstandingPath(context);

    try {
        const content = await fs.readFile(filePath, 'utf-8');
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
    const filePath = getUnderstandingPath(context);

    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}
