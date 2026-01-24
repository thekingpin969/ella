import { config } from 'dotenv'
// config({ path: './.env' })
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { logger as honoLogger } from "hono/logger";
import { logger } from "./src/utils/logger";
import { cors } from "hono/cors";
import projectRoutes from "./src/routes/projects";
import cacheRoutes from "./src/routes/cache";
import { wsManager } from "./src/websocket/manager";
import { chatDB } from './src/db/chatStorage';
import { stageEngine } from './src/engin';
import { initializeInfrastructure } from './src/infrastructure';
import { RegisterTools } from './src/tools';


const app = new Hono();
const { upgradeWebSocket, websocket } = createBunWebSocket<any>();

// Middleware
app.use("*", honoLogger());
app.use("*", cors());

// await authorize()

// Routes
app.route("/api/projects", projectRoutes);
app.route("/api/cache", cacheRoutes);

// WebSocket Endpoint
app.get(
  "/ws/projects/:projectId",
  upgradeWebSocket((c) => {
    const projectId = c.req.param("projectId");

    return {
      data: { projectId },
      onOpen(_event, ws: any) {
        wsManager.addConnection(projectId, ws);
        const prevMsg: any = chatDB.loadMessages(projectId, 1)
        // log(prevMsg)
        for (const msg of prevMsg) {
          // Parse content if it's a JSON string (e.g., for questions)
          let content = msg.content;
          if (typeof content === 'string' && (msg.type === 'questions' || content.startsWith('{'))) {
            try {
              content = JSON.parse(content);
            } catch (e) {
              // Keep as string if parsing fails
            }
          }

          wsManager.broadcast(projectId, {
            type: msg.type || 'message', // Use the stored type from DB
            data: {
              role: msg.role,
              content: content,
              confidence: 0
            },
            timestamp: msg.timestamp
          })
        }
      },
      onMessage(event: any, ws: any) {
        const message = JSON.parse(event.data);
        logger.info("Received message:", message);

        stageEngine.emitEvent({
          name: 'user_response',
          payload: {
            message
          },
          projectId,
        })

        // TODO: Send to Stage Engine
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
