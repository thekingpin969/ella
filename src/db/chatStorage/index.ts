import { ChatDatabase } from "./ChatDatabase";

// Create singleton instance
export const chatDB = new ChatDatabase("./src/db/chatStorage/data/chat-messages.db");

// Export class for testing
export { ChatDatabase };
export type { ChatMessage } from "./ChatDatabase";

// Cleanup on process exit
process.on("exit", () => {
    chatDB.close();
});

process.on("SIGINT", () => {
    chatDB.close();
    process.exit(0);
});

process.on("SIGTERM", () => {
    chatDB.close();
    process.exit(0);
});
