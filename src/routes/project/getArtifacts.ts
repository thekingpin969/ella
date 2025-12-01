import { Hono } from "hono";
import { getDB } from "../../db/client";
import type { DBArtifact } from "../../types/context";
import { WithId } from "mongodb";

const getArtifacts = new Hono();

// GET /api/projects/:id/artifacts
getArtifacts.get("/:id/artifacts", async (c) => {
  const id = c.req.param("id");
  const db = getDB();
  const artifactsCollection = db.collection<WithId<DBArtifact>>("artifacts");

  try {
    const artifacts = await artifactsCollection
      .find({ project_id: id })
      .toArray();

    return c.json({
      artifacts: artifacts.map((a) => ({
        path: a.path,
        type: a.type,
        size: a.size,
        createdAt: a.created_at,
      })),
    });
  } catch (err: any) {
    return c.json({ error: { message: err.message, code: "DB_ERROR" } }, 500);
  }
});

export default getArtifacts;
