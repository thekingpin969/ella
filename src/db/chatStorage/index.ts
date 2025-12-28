import { ChatDatabase } from "./ChatDatabase";

export const chatDB = new ChatDatabase("./src/db/chatStorage/data/chat-messages.db");

export { ChatDatabase };
export type { ChatMessage } from "./ChatDatabase";

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
