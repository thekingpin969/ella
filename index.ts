import { config } from 'dotenv'
// config({ path: './.env' })
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { initMongoDB } from "./src/db/schema";
import projectRoutes from "./src/routes/projects";
import { wsManager } from "./src/websocket/manager";

const app = new Hono();
const { upgradeWebSocket, websocket } = createBunWebSocket<any>();

// Middleware
app.use("*", logger());
app.use("*", cors());

// await authorize()

// Routes
app.route("/api/projects", projectRoutes);

// WebSocket Endpoint
app.get(
  "/ws/projects/:projectId",
  upgradeWebSocket((c) => {
    const projectId = c.req.param("projectId");

    return {
      data: { projectId },
      onOpen(_event, ws: any) {
        wsManager.addConnection(projectId, ws);
      },
      onClose(_event, ws: any) {
        wsManager.removeConnection(projectId, ws);
      },
    };
  }),
);

// Global Error Handler
app.onError((err, c) => {
  console.error("[Server Error]", err);
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

initMongoDB().then(() => {
  console.log(`[Server] E.L.L.A API running on port ${port}`);
});

export default {
  port,
  fetch: app.fetch,
  websocket,
};
