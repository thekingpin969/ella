import { Hono } from "hono";
import { getDB } from "../../db/client";
import type { DBProject } from "../../types/context";
import { WithId } from "mongodb";

const getProject = new Hono();

// GET /api/projects/:id
getProject.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDB();
  const projects = db.collection<WithId<DBProject>>("projects");
  const artifactsCollection = db.collection<WithId<any>>("artifacts");

  try {
    const project = await projects.findOne({ _id: id });

    if (!project) {
      return c.json(
        { error: { message: "Project not found", code: "NOT_FOUND" } },
        404,
      );
    }

    const artifacts = await artifactsCollection
      .find({ project_id: id })
      .toArray();

    return c.json({
      projectId: project._id,
      stage: project.stage,
      confidence: project.confidence,
      artifacts: artifacts.map((a) => a.path),
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      metadata: project.metadata,
    });
  } catch (err: any) {
    return c.json(
      { error: { message: err.message, code: "FETCH_ERROR" } },
      500,
    );
  }
});

export default getProject;
