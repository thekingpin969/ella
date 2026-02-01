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

        // Don't replay old chat messages - just check if workspace exists
        // Screen 2 flow will verify artifacts exist when start_uiux_design is received
        logger.info(`[WS] Client connected to ${projectId}`);
      },
      onMessage(event: any, ws: any) {
        const message = JSON.parse(event.data);
        logger.info("Received message:", message);

        // Screen 2 events should use the message type as the event name
        const screen2Events = [
          'start_uiux_design',
          'mood_selected',
          'inspirations_rated',
          'screen_feedback',
          'complete_screen2'
        ];

        const eventName = screen2Events.includes(message.type)
          ? message.type
          : 'user_response';

        stageEngine.emitEvent({
          name: eventName,
          type: message.type,
          payload: message.type === 'user_response' ? { message } : message,
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
