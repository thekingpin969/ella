import { getPostgresClient } from "./client";
import { logger } from "../../utils/logger";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  project_id: string;
  screen: number;
  scope: string;
  created_at: Date;
  updated_at: Date;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: any;
  type: string;
  created_at: Date;
}

// ─── Table Initialization ────────────────────────────────────────────────────

export async function initChatTables(): Promise<void> {
  const sql = getPostgresClient();

  await sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id  TEXT NOT NULL,
      screen      INTEGER NOT NULL,
      scope       TEXT NOT NULL DEFAULT 'main',
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL,
      content         JSONB NOT NULL,
      type            TEXT DEFAULT 'message',
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Indexes
  await sql`
    CREATE INDEX IF NOT EXISTS idx_conv_lookup
    ON conversations(project_id, screen, scope)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_msg_conv
    ON messages(conversation_id, created_at)
  `;

  // Migration: safe to run repeatedly
  await sql`
    DO $$
    BEGIN
      -- Drop old UNIQUE constraint if it exists
      ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_project_id_screen_scope_key;
      -- Set default for scope column
      ALTER TABLE conversations ALTER COLUMN scope SET DEFAULT 'main';
      -- Backfill NULL scopes
      UPDATE conversations SET scope = 'main' WHERE scope IS NULL;
      -- Make scope NOT NULL
      ALTER TABLE conversations ALTER COLUMN scope SET NOT NULL;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Migration notice: %', SQLERRM;
    END $$;
  `;

  logger.info("[ChatService] Tables and indexes ready");
}

// ─── Conversation Operations ─────────────────────────────────────────────────

/**
 * Create a new conversation. Always creates a new one — use for variant chats
 * and any context where multiple chat threads per scope are allowed.
 */
export async function createConversation(
  projectId: string,
  screen: number,
  scope: string = "main"
): Promise<Conversation> {
  const sql = getPostgresClient();

  const created = await sql<Conversation[]>`
    INSERT INTO conversations (project_id, screen, scope)
    VALUES (${projectId}, ${screen}, ${scope})
    RETURNING *
  `;

  logger.info(
    `[ChatService] Created conversation ${created[0].id} for project=${projectId} screen=${screen} scope=${scope}`
  );

  return created[0];
}

/**
 * Get or create a single conversation for the given context.
 * Use for main screen chats where only one thread per (project, screen, scope) is desired.
 * If multiple exist (from previous bug/migration), returns the most recent one.
 */
export async function getOrCreateConversation(
  projectId: string,
  screen: number,
  scope: string = "main"
): Promise<Conversation> {
  const sql = getPostgresClient();

  const existing = await sql<Conversation[]>`
    SELECT * FROM conversations
    WHERE project_id = ${projectId}
      AND screen = ${screen}
      AND scope = ${scope}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (existing.length > 0) {
    return existing[0];
  }

  return createConversation(projectId, screen, scope);
}

/**
 * Get a specific conversation by its ID.
 */
export async function getConversation(
  conversationId: string
): Promise<Conversation | null> {
  const sql = getPostgresClient();

  const result = await sql<Conversation[]>`
    SELECT * FROM conversations WHERE id = ${conversationId}
  `;

  return result.length > 0 ? result[0] : null;
}

/**
 * List all conversations for a given scope (e.g. all chats for a variant).
 */
export async function getConversationsByScope(
  projectId: string,
  screen: number,
  scope?: string
): Promise<Conversation[]> {
  const sql = getPostgresClient();

  if (scope !== undefined) {
    return sql<Conversation[]>`
      SELECT * FROM conversations
      WHERE project_id = ${projectId} AND screen = ${screen} AND scope = ${scope}
      ORDER BY created_at ASC
    `;
  }

  return sql<Conversation[]>`
    SELECT * FROM conversations
    WHERE project_id = ${projectId} AND screen = ${screen}
    ORDER BY created_at ASC
  `;
}

/**
 * Get all conversations for a project, optionally filtered by screen.
 */
export async function getConversationsByProject(
  projectId: string,
  screen?: number
): Promise<Conversation[]> {
  const sql = getPostgresClient();

  if (screen !== undefined) {
    return sql<Conversation[]>`
      SELECT * FROM conversations
      WHERE project_id = ${projectId} AND screen = ${screen}
      ORDER BY created_at ASC
    `;
  }

  return sql<Conversation[]>`
    SELECT * FROM conversations
    WHERE project_id = ${projectId}
    ORDER BY screen ASC, created_at ASC
  `;
}

// ─── Message Operations ──────────────────────────────────────────────────────

/**
 * Save a message to a conversation.
 */
export async function saveMessage(
  conversationId: string,
  role: "user" | "assistant" | "system",
  content: any,
  type: string = "message"
): Promise<ChatMessage> {
  const sql = getPostgresClient();

  // Ensure content is stored as JSONB
  const jsonContent =
    typeof content === "string" ? JSON.stringify(content) : content;

  const result = await sql<ChatMessage[]>`
    INSERT INTO messages (conversation_id, role, content, type)
    VALUES (${conversationId}, ${role}, ${sql.json(jsonContent)}, ${type})
    RETURNING *
  `;

  // Update conversation's updated_at
  await sql`
    UPDATE conversations SET updated_at = NOW()
    WHERE id = ${conversationId}
  `;

  return result[0];
}

/**
 * Fetch messages for a conversation, ordered by time.
 */
export async function getMessages(
  conversationId: string,
  limit?: number
): Promise<ChatMessage[]> {
  const sql = getPostgresClient();

  if (limit) {
    return sql<ChatMessage[]>`
      SELECT * FROM messages
      WHERE conversation_id = ${conversationId}
      ORDER BY created_at ASC
      LIMIT ${limit}
    `;
  }

  return sql<ChatMessage[]>`
    SELECT * FROM messages
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at ASC
  `;
}

/**
 * Delete a conversation and all its messages (cascade).
 */
export async function deleteConversation(
  conversationId: string
): Promise<void> {
  const sql = getPostgresClient();

  await sql`
    DELETE FROM conversations WHERE id = ${conversationId}
  `;

  logger.info(`[ChatService] Deleted conversation ${conversationId}`);
}
