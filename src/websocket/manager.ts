import { ServerWebSocket } from "bun";
import { WSMessage } from "./types";
import { chatDB } from "../db/chatStorage";

/**
 * Interface for the WebSocket context.
 * This is used to store data associated with a WebSocket connection.
 */
interface WSContext {
  projectId: string;
}

/**
 * Manages WebSocket connections for different projects.
 * This class is responsible for adding, removing, and broadcasting messages to WebSockets.
 */
class WebSocketManager {
  // Map projectId -> Set of WebSockets
  private connections: Map<string, Set<ServerWebSocket<WSContext>>>;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Initializes a new instance of the WebSocketManager class.
   */
  constructor() {
    this.connections = new Map();
    this.startHeartbeat();
  }

  /**
   * Adds a new WebSocket connection for a given project.
   * @param projectId The ID of the project.
   * @param ws The WebSocket connection to add.
   */
  public addConnection(projectId: string, ws: ServerWebSocket<WSContext>) {
    if (!this.connections.has(projectId)) {
      this.connections.set(projectId, new Set());
    }
    this.connections.get(projectId)!.add(ws);
    console.log(
      `[WS] Client connected to project ${projectId}. Total clients: ${this.connections.get(projectId)?.size}`,
    );
  }

  /**
   * Removes a WebSocket connection for a given project.
   * @param projectId The ID of the project.
   * @param ws The WebSocket connection to remove.
   */
  public removeConnection(projectId: string, ws: ServerWebSocket<WSContext>) {
    const projectConns = this.connections.get(projectId);
    if (projectConns) {
      projectConns.delete(ws);
      if (projectConns.size === 0) {
        this.connections.delete(projectId);
      }
    }
    console.log(`[WS] Client disconnected from project ${projectId}`);
  }

  /**
   * Broadcasts a message to all WebSocket connections for a given project.
   * @param projectId The ID of the project.
   * @param message The message to broadcast.
   */
  public broadcast(projectId: string, message: WSMessage) {
    const projectConns = this.connections.get(projectId);
    if (!projectConns) return console.log(projectConns);

    const payload = JSON.stringify(message);
    for (const ws of projectConns) {
      if (ws.readyState === 1) {
        // Open
        console.log(payload);
        ws.send(payload);
      }
    }
  }

  /**
   * Starts a heartbeat interval to keep WebSocket connections alive.
   */
  private startHeartbeat() {
    const interval = parseInt(process.env.WS_HEARTBEAT_INTERVAL || "30000");
    this.heartbeatInterval = setInterval(() => {
      // Bun's ServerWebSocket handles ping/pong automatically at the protocol level usually,
      // but we can send a "ping" type message to keep application state alive if needed.
      // For this implementation, we rely on standard WS keep-alive.
      // Logging active connection count stats:
      let total = 0;
      for (const set of this.connections.values()) total += set.size;
      if (total > 0) {
        console.log(
          `[WS] Heartbeat. Active projects: ${this.connections.size}, Total clients: ${total}`,
        );
      }
    }, interval);
  }

  public sendMessage(projectId: string, { message }: { message: string | number | null }) {
    const projectConns = this.connections.get(projectId);
    const payload = {
      type: "message",
      timestamp: new Date().toISOString(),
      data: {
        role: "assistant",
        content: message,
      }
    }
    chatDB.saveMessage({
      projectId,
      content: payload.data.content,
      role: payload.data.role as any,
      screen: 1,
      timestamp: payload.timestamp,
      type: payload.type
    })
    if (!projectConns) return console.log('no clients for ', projectId);
    for (const ws of projectConns) {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(payload));
      }
    }

    return { sendAmount: projectConns }
  }

  public askQuestion(projectId: string, { questions }: { questions: any[] }) {
    const projectConns = this.connections.get(projectId);
    const payload = {
      type: "questions",
      timestamp: new Date().toISOString(),
      data: {
        role: "assistant",
        content: {
          questions
        },
      }
    }
    chatDB.saveMessage({
      projectId,
      content: payload.data.content,
      role: payload.data.role as any,
      screen: 1,
      timestamp: payload.timestamp,
      type: payload.type
    })
    if (!projectConns) return console.log('no clients for ', projectId);
    for (const ws of projectConns) {
      if (ws.readyState === 1) {
        // console.log(payload);
        ws.send(JSON.stringify(payload));
      }
    }

    return { sendAmount: projectConns }

  }


  public sendFiller(projectId: string, filler: string) {
    const projectConns = this.connections.get(projectId);
    if (!projectConns) return console.log('no clients for ', projectId);
    const payload = {
      type: "typing",
      timestamp: new Date().toISOString(),
      data: {
        role: "assistant",
        content: {
          filler
        },
      }
    }
    for (const ws of projectConns) {
      if (ws.readyState === 1) {
        // console.log(payload);
        ws.send(JSON.stringify(payload));
      }
    }

    return { sendAmount: projectConns }

  }


  /**
   * Shuts down the WebSocketManager and clears the heartbeat interval.
   */
  public shutdown() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
  }
}

/**
 * Singleton instance of the WebSocketManager.
 */
export const wsManager = new WebSocketManager();
