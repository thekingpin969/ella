// src/infrastructure/index.ts
import { memoryService, embeddingService } from "../memory";
import { fsManager } from "../fs";
import { initChatTables } from "../db/postgres";
import { initMongoDB } from "../db/mongodb/schema";
import { connectToPostgres, closePostgres } from "../db/postgres";
import { logger } from "../utils/logger";

/**
 * Initialize all infrastructure components
 */
export async function initializeInfrastructure(): Promise<void> {
    logger.info("\n🏗️  Initializing E.L.L.A Infrastructure...\n");

    try {
        // 1. MongoDB
        logger.info("[1/5] 📊 Connecting to MongoDB...");
        await initMongoDB();
        logger.info("✅ MongoDB connected\n");

        // 2. ChromaDB & Memory System (with OpenAI embeddings)
        logger.info("[2/5] 🧠 Initializing Memory System (ChromaDB + Embeddings)...");
        await memoryService.initialize();

        const memoryHealth = await memoryService.healthCheck();
        if (!memoryHealth) {
            logger.warn("⚠️ Memory system degraded - some features may be limited");
        }

        // Check embedding provider
        const embeddingHealth = await embeddingService.healthCheck();
        logger.info(`   Embedding Provider: ${embeddingHealth.provider}`);
        logger.info(`   Status: ${embeddingHealth.available ? "✅" : "⚠️"} ${embeddingHealth.details}`);
        logger.info("✅ Memory system ready\n");

        // 3. File System Manager
        logger.info("[3/5] 📁 Initializing File System Manager...");
        const fsStats = await fsManager.getStats();
        logger.info(`✅ Workspace ready (${fsStats.projects} projects)\n`);

        // 4. PostgreSQL (Chat Storage)
        logger.info("[4/5] 🐘 Connecting to PostgreSQL...");
        await connectToPostgres();
        logger.info("✅ PostgreSQL connected\n");

        // 5. Chat Tables (PostgreSQL)
        logger.info("[5/5] 💬 Initializing Chat Tables...");
        await initChatTables();
        logger.info("✅ Chat tables ready\n");

        logger.info("✅ Infrastructure initialized successfully!\n");

        // Print summary
        await printInfrastructureSummary();

    } catch (error) {
        logger.error("\n❌ Infrastructure initialization failed:", error);
        throw error;
    }
}

/**
 * Print infrastructure summary
 */
async function printInfrastructureSummary(): Promise<void> {
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logger.info("📊 INFRASTRUCTURE SUMMARY");
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Memory stats
    const memoryStats = await memoryService.getStats();
    logger.info("🧠 Memory System:");
    logger.info(`   Session Memory: ${memoryStats.session.totalDocs} docs in ${memoryStats.session.projects} projects`);
    logger.info(`   ChromaDB: ${memoryStats.chroma?.totalCollections || 0} collections`);
    logger.info(`   Embeddings: ${memoryStats.embeddings.service} (${memoryStats.embeddings.available ? "✅" : "⚠️"})\n`);

    // File system stats
    const fsStats = await fsManager.getStats();
    logger.info("📁 File System:");
    logger.info(`   Projects: ${fsStats.projects}`);
    logger.info(`   Files: ${fsStats.totalFiles}`);
    logger.info(`   Size: ${(fsStats.totalSize / 1024 / 1024).toFixed(2)} MB\n`);

    logger.info("🐘 PostgreSQL:");
    logger.info(`   Status: ✅ Connected (Chat + Storage)\n`);

    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

/**
 * Graceful shutdown
 */
export async function shutdownInfrastructure(): Promise<void> {
    logger.info("\n🛑 Shutting down infrastructure...");

    try {
        await closePostgres();
        logger.info("✅ PostgreSQL closed");

        logger.info("✅ Infrastructure shutdown complete\n");
    } catch (error) {
        logger.error("❌ Shutdown error:", error);
    }
}

// Export services for easy access
export { memoryService, embeddingService } from "../memory";
export { fsManager } from "../fs";