import postgres from "postgres";
import { logger } from "../../utils/logger";

let sql: postgres.Sql;

export async function connectToPostgres() {
    try {
        const POSTGRES_URI = process.env.POSTGRES_URI;

        if (!POSTGRES_URI) {
            throw new Error("POSTGRES_URI environment variable is not set");
        }

        sql = postgres(POSTGRES_URI);

        // Test the connection
        await sql`SELECT 1`;
        logger.info(`[PostgreSQL] Connected successfully`);
    } catch (error) {
        logger.error("[PostgreSQL] Failed to connect to PostgreSQL", error);
        process.exit(1);
    }
}

export function getPostgresClient() {
    if (!sql) {
        throw new Error(
            "PostgreSQL not initialized. Call connectToPostgres first."
        );
    }
    return sql;
}

export async function closePostgres() {
    if (sql) {
        await sql.end();
        logger.info("[PostgreSQL] Connection closed");
    }
}
