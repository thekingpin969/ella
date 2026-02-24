export { connectToPostgres, getPostgresClient, closePostgres } from "./client";
export {
    initChatTables,
    createConversation,
    getOrCreateConversation,
    getConversation,
    getConversationsByScope,
    getConversationsByProject,
    saveMessage,
    getMessages,
    deleteConversation,
} from "./chatService";
export type { Conversation, ChatMessage } from "./chatService";
