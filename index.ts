import { config } from 'dotenv'
// config({ path: './.env' })
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { logger as honoLogger } from "hono/logger";
import { logger } from "./src/utils/logger";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import projectRoutes from "./src/routes/projects";
import cacheRoutes from "./src/routes/cache";
import chatRoutes from "./src/routes/chat";
import { wsManager } from "./src/websocket/manager";
import { getOrCreateConversation, createConversation, saveMessage } from './src/db/postgres';
import { stageEngine } from './src/engin';
import { initializeInfrastructure } from './src/infrastructure';
import { RegisterTools } from './src/tools';


const app = new Hono();
const { upgradeWebSocket, websocket } = createBunWebSocket<any>();

// Middleware
app.use("*", honoLogger());
app.use("*", cors());

// Serve static files from test directory
app.use('/test/*', serveStatic({ root: './' }));

// await authorize()

// Routes
app.route("/api/projects", projectRoutes);
app.route("/api/cache", cacheRoutes);
app.route("/api/chat", chatRoutes);

// WebSocket Endpoint
app.get(
  "/ws/projects/:projectId",
  upgradeWebSocket((c) => {
    const projectId = c.req.param("projectId");

    return {
      data: { projectId },
      onOpen(_event, ws: any) {
        wsManager.addConnection(projectId, ws);

        // Don't replay old chat messages - just check if workspace exists
        // Screen 2 flow will verify artifacts exist when start_uiux_design is received
        logger.info(`[WS] Client connected to ${projectId}`);
      },
      async onMessage(event: any, ws: any) {
        const message = JSON.parse(event.data);
        logger.info("Received message:", message);

        // Screen 2 events should use the message type as the event name
        const screen2Events = [
          'start_uiux_design',
          'mood_selected',
          'inspirations_rated',
          'brand_identity_feedback',
          'lock_brand_identity',
          'brand_dna_feedback',
          'lock_brand_dna',
          'screen_feedback',
          'variant_chat',
          'create_variant',
          'refine_components',
          'complete_screen2'
        ];

        const eventName = screen2Events.includes(message.type)
          ? message.type
          : 'user_response';

        // Persist incoming user messages
        if (eventName === 'user_response') {
          getOrCreateConversation(projectId, 1).then(conv =>
            saveMessage(conv.id, 'user', message.content || message)
          ).catch(err => logger.error('[WS] Failed to save user message:', err));
        } else if (eventName === 'variant_chat' && message.screenName && message.variant) {
          const scope = `${message.screenName}/${message.variant}`;

          // Only reuse chatId if it's a valid UUID (not a local Date.now() ID)
          const isValidUUID = message.chatId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(message.chatId);

          try {
            const conv = isValidUUID
              ? { id: message.chatId }
              : await createConversation(projectId, 2, scope);

            // Set chatId BEFORE emitting — so the handler gets the real UUID
            message.chatId = conv.id;
            saveMessage(conv.id, 'user', message.message || message).catch(
              err => logger.error('[WS] Failed to save variant chat message:', err)
            );
          } catch (err) {
            logger.error('[WS] Failed to create/lookup conversation:', err);
          }
        }

        stageEngine.emitEvent({
          name: eventName,
          type: message.type,
          payload: message.type === 'user_response' ? { message } : message,
          projectId,
        })
      },


      onClose(_event, ws: any) {
        wsManager.removeConnection(projectId, ws);
      },
    };
  }),
);

// Global Error Handler
app.onError((err, c) => {
  logger.error("[Server Error]", err.message);
  return c.json(
    {
      error: {
        message: err.message || "Internal Server Error",
        code: "INTERNAL_ERROR",
        timestamp: new Date().toISOString(),
      },
    },
    500,
  );
});

const port = process.env.PORT || 3000;

await initializeInfrastructure()
RegisterTools()
logger.info(`[Server] E.L.L.A API running on port ${port}`);

export default {
  port,
  fetch: app.fetch,
  websocket,
};
