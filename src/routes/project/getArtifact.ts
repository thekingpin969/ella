import { Hono } from "hono";
import { getDB } from "../../db/mongodb/client";
import { DBArtifact } from "../../types/context";
import { WithId } from "mongodb";

const getArtifact = new Hono();

// GET /api/projects/:id/artifacts/:path
getArtifact.get("/:id/artifacts/:path", async (c) => {
  // In a real app, this would read from disk/S3.
  // For this infrastructure setup, we return dummy content or lookup db.
  const { id, path } = c.req.param();
  const db = getDB();
  const artifacts = db.collection<WithId<DBArtifact>>("artifacts");

  // Basic validation that artifact exists in DB
  const artifact = await artifacts.findOne({ project_id: id, path: path });

  if (!artifact) {
    return c.json(
      { error: { message: "Artifact not found", code: "NOT_FOUND" } },
      404,
    );
  }

  // Returning mock content as FS is not implemented yet per instructions
  return c.text(`[Content for ${path}]`);
});

export default getArtifact;
