// src/fs/FileSystemManager.ts
import fs from "fs/promises";
import path from "path";
import { existsSync, mkdirSync } from "fs";
import { updateFile, uploadFile } from "../db/drive";
import { getDB } from "../db/mongodb/client";

/**
 * File System Manager (FSM)
 * Manages local workspace, Google Drive sync, and MongoDB registry
 */
export class FileSystemManager {
    private workspaceRoot: string;

    constructor(workspaceRoot: string = "./workspace") {
        this.workspaceRoot = workspaceRoot;
        this.ensureWorkspaceExists();
    }

    private ensureWorkspaceExists(): void {
        if (!existsSync(this.workspaceRoot)) {
            mkdirSync(this.workspaceRoot, { recursive: true });
            console.log(`[FSM] Created workspace: ${this.workspaceRoot}`);
        }
    }

    private getProjectPath(projectId: string): string {
        return path.join(this.workspaceRoot, projectId);
    }

    private getFilePath(projectId: string, relativePath: string): string {
        return path.join(this.getProjectPath(projectId), relativePath);
    }

    // ==========================================
    // PROJECT WORKSPACE MANAGEMENT
    // ==========================================

    async initializeProject(projectId: string): Promise<void> {
        const projectPath = this.getProjectPath(projectId);

        if (existsSync(projectPath)) {
            console.log(`[FSM] Project workspace already exists: ${projectId}`);
            return;
        }

        const directories = ["src", "tests", ".ella", "temp", "docs", "artifacts"];

        for (const dir of directories) {
            const dirPath = path.join(projectPath, dir);
            await fs.mkdir(dirPath, { recursive: true });
        }

        console.log(`[FSM] ✅ Initialized workspace: ${projectId}`);
    }

    async cleanProject(projectId: string): Promise<void> {
        const projectPath = this.getProjectPath(projectId);

        if (!existsSync(projectPath)) {
            console.log(`[FSM] Nothing to clean: ${projectId}`);
            return;
        }

        await fs.rm(projectPath, { recursive: true, force: true });
        console.log(`[FSM] 🗑️ Cleaned workspace: ${projectId}`);
    }

    // ==========================================
    // FILE OPERATIONS (Local)
    // ==========================================

    async writeFile(
        projectId: string,
        relativePath: string,
        content: string
    ): Promise<string> {
        const fullPath = this.getFilePath(projectId, relativePath);
        const directory = path.dirname(fullPath);

        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(fullPath, content, "utf-8");
        console.log(`[FSM] ✅ Written: ${relativePath}`);

        return fullPath;
    }

    async readFile(projectId: string, relativePath: string): Promise<string> {
        const fullPath = this.getFilePath(projectId, relativePath);

        if (!existsSync(fullPath)) {
            throw new Error(`File not found: ${relativePath}`);
        }

        return await fs.readFile(fullPath, "utf-8");
    }

    fileExists(projectId: string, relativePath: string): boolean {
        return existsSync(this.getFilePath(projectId, relativePath));
    }

    async deleteFile(projectId: string, relativePath: string): Promise<void> {
        const fullPath = this.getFilePath(projectId, relativePath);

        if (existsSync(fullPath)) {
            await fs.unlink(fullPath);
            console.log(`[FSM] 🗑️ Deleted: ${relativePath}`);
        }
    }

    async listFiles(
        projectId: string,
        relativePath: string = ""
    ): Promise<string[]> {
        const fullPath = this.getFilePath(projectId, relativePath);

        if (!existsSync(fullPath)) {
            return [];
        }

        const entries = await fs.readdir(fullPath, { withFileTypes: true });
        return entries
            .filter(entry => entry.isFile())
            .map(entry => path.join(relativePath, entry.name));
    }

    // ==========================================
    // BACKUP & VERSIONING
    // ==========================================

    async backupFile(projectId: string, relativePath: string): Promise<string> {
        const content = await this.readFile(projectId, relativePath);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const backupPath = `${relativePath}.backup-${timestamp}`;

        await this.writeFile(projectId, backupPath, content);
        console.log(`[FSM] 💾 Backup created: ${backupPath}`);

        return backupPath;
    }

    async restoreBackup(
        projectId: string,
        backupPath: string,
        targetPath: string
    ): Promise<void> {
        const content = await this.readFile(projectId, backupPath);
        await this.writeFile(projectId, targetPath, content);
        console.log(`[FSM] ♻️ Restored: ${targetPath} from ${backupPath}`);
    }

    // ==========================================
    // DIFF GENERATION
    // ==========================================

    async generateDiff(
        projectId: string,
        oldPath: string,
        newPath: string
    ): Promise<string> {
        const oldContent = await this.readFile(projectId, oldPath);
        const newContent = await this.readFile(projectId, newPath);

        const oldLines = oldContent.split("\n");
        const newLines = newContent.split("\n");

        let diff = `--- ${oldPath}\n+++ ${newPath}\n`;

        const maxLength = Math.max(oldLines.length, newLines.length);
        for (let i = 0; i < maxLength; i++) {
            if (oldLines[i] !== newLines[i]) {
                if (oldLines[i]) diff += `- ${oldLines[i]}\n`;
                if (newLines[i]) diff += `+ ${newLines[i]}\n`;
            }
        }

        return diff;
    }

    // ==========================================
    // GOOGLE DRIVE SYNC
    // ==========================================

    async syncToDrive(
        projectId: string,
        relativePath: string,
        driveFolderId: string
    ): Promise<string> {
        const db = getDB();
        const filesCollection = db.collection("files");

        const fullPath = this.getFilePath(projectId, relativePath);

        const existingFile = await filesCollection.findOne({
            projectId,
            path: relativePath
        });

        let driveFileId: string;

        if (existingFile?.driveFileId) {
            const content = await this.readFile(projectId, relativePath);
            await updateFile(existingFile.driveFileId, content);
            driveFileId = existingFile.driveFileId;
            console.log(`[FSM] ☁️ Updated in Drive: ${relativePath}`);
        } else {
            const fileName = path.basename(relativePath);
            const mimeType = this.getMimeType(fileName);
            driveFileId = await uploadFile(fullPath, fileName, mimeType, driveFolderId);
            console.log(`[FSM] ☁️ Uploaded to Drive: ${relativePath}`);
        }

        await filesCollection.updateOne(
            { projectId, path: relativePath },
            {
                $set: {
                    projectId,
                    path: relativePath,
                    driveFileId,
                    lastModified: new Date(),
                    size: (await fs.stat(fullPath)).size
                }
            },
            { upsert: true }
        );

        return driveFileId;
    }

    private getMimeType(filename: string): string {
        const ext = path.extname(filename).toLowerCase();
        const mimeTypes: Record<string, string> = {
            ".js": "text/javascript",
            ".ts": "text/typescript",
            ".json": "application/json",
            ".md": "text/markdown",
            ".txt": "text/plain",
            ".html": "text/html",
            ".css": "text/css",
            ".jsx": "text/javascript",
            ".tsx": "text/typescript"
        };
        return mimeTypes[ext] || "text/plain";
    }

    // ==========================================
    // BATCH OPERATIONS
    // ==========================================

    async writeFiles(
        projectId: string,
        files: Array<{ path: string; content: string }>
    ): Promise<void> {
        await Promise.all(
            files.map(file => this.writeFile(projectId, file.path, file.content))
        );
        console.log(`[FSM] ✅ Written ${files.length} files`);
    }

    async syncProjectToDrive(
        projectId: string,
        driveFolderId: string
    ): Promise<number> {
        const files = await this.listAllFiles(projectId);
        let synced = 0;

        for (const file of files) {
            try {
                await this.syncToDrive(projectId, file, driveFolderId);
                synced++;
            } catch (error) {
                console.error(`[FSM] Failed to sync ${file}:`, error);
            }
        }

        console.log(`[FSM] ☁️ Synced ${synced}/${files.length} files to Drive`);
        return synced;
    }

    private async listAllFiles(
        projectId: string,
        relativePath: string = ""
    ): Promise<string[]> {
        const fullPath = this.getFilePath(projectId, relativePath);
        const files: string[] = [];

        if (!existsSync(fullPath)) {
            return files;
        }

        const entries = await fs.readdir(fullPath, { withFileTypes: true });

        for (const entry of entries) {
            const entryPath = path.join(relativePath, entry.name);

            if (entry.isDirectory()) {
                if (entry.name === ".ella") continue;
                const subFiles = await this.listAllFiles(projectId, entryPath);
                files.push(...subFiles);
            } else {
                files.push(entryPath);
            }
        }

        return files;
    }

    // ==========================================
    // STATS & HEALTH
    // ==========================================

    async getStats(): Promise<any> {
        const projects = await fs.readdir(this.workspaceRoot);
        let totalFiles = 0;
        let totalSize = 0;

        for (const projectId of projects) {
            const files = await this.listAllFiles(projectId);
            totalFiles += files.length;

            for (const file of files) {
                try {
                    const fullPath = this.getFilePath(projectId, file);
                    const stats = await fs.stat(fullPath);
                    totalSize += stats.size;
                } catch (error) {
                    // Skip
                }
            }
        }

        return {
            projects: projects.length,
            totalFiles,
            totalSize,
            workspaceRoot: this.workspaceRoot
        };
    }
}

// Singleton instance
export const fsManager = new FileSystemManager();