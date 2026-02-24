import { Hono } from "hono";
import {
    getConversationsByScope,
    getConversationsByProject,
    getMessages,
} from "../db/postgres";
import { logger } from "../utils/logger";

const chatRoutes = new Hono();

/**
 * GET /api/chat/:projectId/conversations
 * List all conversations for a project, optionally filtered by screen and scope.
 * Query params: ?screen=2&scope=LoginScreen/variantA
 */
chatRoutes.get("/:projectId/conversations", async (c) => {
    const projectId = c.req.param("projectId");
    const screen = c.req.query("screen");
    const scope = c.req.query("scope");

    try {
        let conversations;
        if (screen !== undefined && scope !== undefined) {
            conversations = await getConversationsByScope(
                projectId,
                parseInt(screen),
                scope
            );
        } else if (screen !== undefined) {
            conversations = await getConversationsByScope(
                projectId,
                parseInt(screen)
            );
        } else {
            conversations = await getConversationsByProject(projectId);
        }

        return c.json({ conversations });
    } catch (error: any) {
        logger.error("[ChatAPI] Error fetching conversations:", error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * GET /api/chat/:projectId/conversations/:conversationId/messages
 * Fetch messages for a specific conversation.
 * Query params: ?limit=50
 */
chatRoutes.get(
    "/:projectId/conversations/:conversationId/messages",
    async (c) => {
        const conversationId = c.req.param("conversationId");
        const limit = c.req.query("limit");

        try {
            const messages = await getMessages(
                conversationId,
                limit ? parseInt(limit) : undefined
            );

            return c.json({ messages });
        } catch (error: any) {
            logger.error("[ChatAPI] Error fetching messages:", error);
            return c.json({ error: error.message }, 500);
        }
    }
);

export default chatRoutes;
