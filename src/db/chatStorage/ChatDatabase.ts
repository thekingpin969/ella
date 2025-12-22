import { Database } from "bun:sqlite";
import path from "path";
import fs from "fs";

export interface ChatMessage {
    id?: number;
    projectId: string;
    screen: number;
    role: "user" | "assistant" | "system";
    content: any;
    timestamp: string;
    type: string;
}

/**
 * SQLite database for chat message storage
 * Lightweight, fast, perfect for personal use
 */
export class ChatDatabase {
    private db: Database;
    private dbPath: string;

    // Prepared statements (compiled once, reused many times = fast!)
    private insertStmt: any;
    private selectByProjectScreenStmt: any;
    private selectByProjectStmt: any;
    private selectAllStmt: any;
    private deleteByProjectStmt: any;
    private deleteByProjectScreenStmt: any;
    private countByProjectStmt: any;

    constructor(dbPath: string = "./src/db/chatStorage/data/chat-messages.db") {
        this.dbPath = dbPath;

        // Ensure data directory exists
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Open database (creates file if doesn't exist)
        this.db = new Database(dbPath);

        // Enable WAL mode for better concurrency
        this.db.run("PRAGMA journal_mode = WAL");

        // Initialize schema
        this.initSchema();

        // Prepare statements
        this.prepareStatements();

        console.log(`[ChatDatabase] Initialized: ${dbPath}`);
    }

    /**
     * Create tables and indexes
     */
    private initSchema(): void {
        this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        screen INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // Create indexes for fast queries
        this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_project_screen 
      ON messages(project_id, screen, timestamp)
    `);

        this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_project 
      ON messages(project_id, timestamp)
    `);

        this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_timestamp 
      ON messages(timestamp DESC)
    `);
    }

    /**
     * Prepare statements for reuse (performance boost)
     */
    private prepareStatements(): void {
        // Insert message
        this.insertStmt = this.db.prepare(`
      INSERT INTO messages (project_id, screen, role, content, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);

        // Select by project and screen
        this.selectByProjectScreenStmt = this.db.prepare(`
      SELECT id, project_id as projectId, screen, role, content, timestamp
      FROM messages
      WHERE project_id = ? AND screen = ?
      ORDER BY timestamp ASC
    `);

        // Select all messages for a project
        this.selectByProjectStmt = this.db.prepare(`
      SELECT id, project_id as projectId, screen, role, content, timestamp
      FROM messages
      WHERE project_id = ?
      ORDER BY screen ASC, timestamp ASC
    `);

        // Select all messages (for debugging/admin)
        this.selectAllStmt = this.db.prepare(`
      SELECT id, project_id as projectId, screen, role, content, timestamp
      FROM messages
      ORDER BY timestamp DESC
      LIMIT ?
    `);

        // Delete messages by project
        this.deleteByProjectStmt = this.db.prepare(`
      DELETE FROM messages WHERE project_id = ?
    `);

        // Delete messages by project and screen
        this.deleteByProjectScreenStmt = this.db.prepare(`
      DELETE FROM messages WHERE project_id = ? AND screen = ?
    `);

        // Count messages by project
        this.countByProjectStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM messages WHERE project_id = ?
    `);
    }

    /**
     * Save a message
     */
    saveMessage(message: ChatMessage): number {
        try {
            const result = this.insertStmt.run(
                message.projectId,
                message.screen,
                message.role,
                message.content,
                message.timestamp,
            );

            return result.lastInsertRowid as number;
        } catch (error) {
            console.error("[ChatDatabase] Failed to save message:", error);
            throw error;
        }
    }

    /**
     * Save multiple messages in a transaction (much faster!)
     */
    saveMessages(messages: ChatMessage[]): void {
        const transaction = this.db.transaction((msgs: ChatMessage[]) => {
            for (const msg of msgs) {
                this.insertStmt.run(
                    msg.projectId,
                    msg.screen,
                    msg.role,
                    msg.content,
                    msg.timestamp,
                );
            }
        });

        try {
            transaction(messages);
        } catch (error) {
            console.error("[ChatDatabase] Failed to save messages:", error);
            throw error;
        }
    }

    /**
     * Load messages for a project and screen
     */
    loadMessages(projectId: string, screen: number): ChatMessage[] {
        try {
            const messages = this.selectByProjectScreenStmt.all(projectId, screen);
            return messages as ChatMessage[];
        } catch (error) {
            console.error("[ChatDatabase] Failed to load messages:", error);
            return [];
        }
    }

    /**
     * Load all messages for a project (all screens)
     */
    loadAllMessages(projectId: string): ChatMessage[] {
        try {
            const messages = this.selectByProjectStmt.all(projectId);
            return messages as ChatMessage[];
        } catch (error) {
            console.error("[ChatDatabase] Failed to load all messages:", error);
            return [];
        }
    }

    /**
     * Get recent messages (for debugging/admin)
     */
    getRecentMessages(limit: number = 100): ChatMessage[] {
        try {
            const messages = this.selectAllStmt.all(limit);
            return messages as ChatMessage[];
        } catch (error) {
            console.error("[ChatDatabase] Failed to get recent messages:", error);
            return [];
        }
    }

    /**
     * Delete all messages for a project
     */
    deleteMessages(projectId: string): number {
        try {
            const result = this.deleteByProjectStmt.run(projectId);
            return result.changes;
        } catch (error) {
            console.error("[ChatDatabase] Failed to delete messages:", error);
            throw error;
        }
    }

    /**
     * Delete messages for a specific screen
     */
    deleteScreenMessages(projectId: string, screen: number): number {
        try {
            const result = this.deleteByProjectScreenStmt.run(projectId, screen);
            return result.changes;
        } catch (error) {
            console.error("[ChatDatabase] Failed to delete screen messages:", error);
            throw error;
        }
    }

    /**
     * Count messages for a project
     */
    countMessages(projectId: string): number {
        try {
            const result = this.countByProjectStmt.get(projectId) as { count: number };
            return result.count;
        } catch (error) {
            console.error("[ChatDatabase] Failed to count messages:", error);
            return 0;
        }
    }

    /**
     * Get database statistics
     */
    getStats(): {
        totalMessages: number;
        databaseSize: number;
        projects: number;
    } {
        try {
            const totalMessages = this.db.prepare("SELECT COUNT(*) as count FROM messages").get() as { count: number };

            const projects = this.db.prepare("SELECT COUNT(DISTINCT project_id) as count FROM messages").get() as { count: number };

            // Get database file size
            let databaseSize = 0;
            try {
                const stats = fs.statSync(this.dbPath);
                databaseSize = stats.size;
            } catch (e) {
                // File doesn't exist yet or can't read
            }

            return {
                totalMessages: totalMessages.count,
                databaseSize,
                projects: projects.count
            };
        } catch (error) {
            console.error("[ChatDatabase] Failed to get stats:", error);
            return { totalMessages: 0, databaseSize: 0, projects: 0 };
        }
    }

    /**
     * Optimize database (run periodically)
     */
    optimize(): void {
        try {
            this.db.run("VACUUM");
            this.db.run("ANALYZE");
            console.log("[ChatDatabase] Database optimized");
        } catch (error) {
            console.error("[ChatDatabase] Failed to optimize:", error);
        }
    }

    /**
     * Close database connection
     */
    close(): void {
        try {
            this.db.close();
            console.log("[ChatDatabase] Database closed");
        } catch (error) {
            console.error("[ChatDatabase] Failed to close database:", error);
        }
    }
}
