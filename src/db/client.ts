import { MongoClient, Db } from "mongodb";

let db: Db;

export async function connectToDB() {
  try {
    const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
    const DB_NAME = process.env.DB_NAME || "ella";

    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log(`[DB] Connected to ${MONGO_URI}`);
  } catch (error) {
    console.error("[DB] Failed to connect to MongoDB", error);
    process.exit(1);
  }
}

export function getDB() {
  if (!db) {
    throw new Error("Database not initialized. Call connectToDB first.");
  }
  return db;
}
