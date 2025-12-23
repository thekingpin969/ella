// src/infrastructure/index.ts
import { memoryService, embeddingService } from "../memory";
import { fsManager } from "../fs";
import { chatDB } from "../db/chatStorage";
import { initMongoDB } from "../db/mongodb/schema";

/**
 * Initialize all infrastructure components
 */
export async function initializeInfrastructure(): Promise<void> {
    console.log("\n🏗️  Initializing E.L.L.A Infrastructure...\n");

    try {
        // 1. MongoDB
        console.log("[1/4] 📊 Connecting to MongoDB...");
        await initMongoDB();
        console.log("✅ MongoDB connected\n");

        // 2. ChromaDB & Memory System (with OpenAI embeddings)
        console.log("[2/4] 🧠 Initializing Memory System (ChromaDB + Embeddings)...");
        await memoryService.initialize();

        const memoryHealth = await memoryService.healthCheck();
        if (!memoryHealth) {
            console.warn("⚠️ Memory system degraded - some features may be limited");
        }

        // Check embedding provider
        const embeddingHealth = await embeddingService.healthCheck();
        console.log(`   Embedding Provider: ${embeddingHealth.provider}`);
        console.log(`   Status: ${embeddingHealth.available ? "✅" : "⚠️"} ${embeddingHealth.details}`);
        console.log("✅ Memory system ready\n");

        // 3. File System Manager
        console.log("[3/4] 📁 Initializing File System Manager...");
        const fsStats = await fsManager.getStats();
        console.log(`✅ Workspace ready (${fsStats.projects} projects)\n`);

        // 4. Chat Database (SQLite)
        console.log("[4/4] 💬 Initializing Chat Database...");
        const chatStats = chatDB.getStats();
        console.log(`✅ Chat DB ready (${chatStats.totalMessages} messages)\n`);

        console.log("✅ Infrastructure initialized successfully!\n");

        // Print summary
        await printInfrastructureSummary();

    } catch (error) {
        console.error("\n❌ Infrastructure initialization failed:", error);
        throw error;
    }
}

/**
 * Print infrastructure summary
 */
async function printInfrastructureSummary(): Promise<void> {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📊 INFRASTRUCTURE SUMMARY");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Memory stats
    const memoryStats = await memoryService.getStats();
    console.log("🧠 Memory System:");
    console.log(`   Session Memory: ${memoryStats.session.totalDocs} docs in ${memoryStats.session.projects} projects`);
    console.log(`   ChromaDB: ${memoryStats.chroma?.totalCollections || 0} collections`);
    console.log(`   Embeddings: ${memoryStats.embeddings.service} (${memoryStats.embeddings.available ? "✅" : "⚠️"})\n`);

    // File system stats
    const fsStats = await fsManager.getStats();
    console.log("📁 File System:");
    console.log(`   Projects: ${fsStats.projects}`);
    console.log(`   Files: ${fsStats.totalFiles}`);
    console.log(`   Size: ${(fsStats.totalSize / 1024 / 1024).toFixed(2)} MB\n`);

    // Chat stats
    const chatStats = chatDB.getStats();
    console.log("💬 Chat Database:");
    console.log(`   Messages: ${chatStats.totalMessages}`);
    console.log(`   Projects: ${chatStats.projects}`);
    console.log(`   DB Size: ${(chatStats.databaseSize / 1024).toFixed(2)} KB\n`);

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

/**
 * Graceful shutdown
 */
export async function shutdownInfrastructure(): Promise<void> {
    console.log("\n🛑 Shutting down infrastructure...");

    try {
        chatDB.close();
        console.log("✅ Chat DB closed");

        console.log("✅ Infrastructure shutdown complete\n");
    } catch (error) {
        console.error("❌ Shutdown error:", error);
    }
}

// Export services for easy access
export { memoryService, embeddingService } from "../memory";
export { fsManager } from "../fs";
export { chatDB } from "../db/chatStorage";