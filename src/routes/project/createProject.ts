import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getDB } from "../../db/mongodb/client";
import { createProjectSchema } from "../../utils/validation";
import { generateId } from "../../utils/id";
// import { stageEngine } from "../../mocks/stage-engine";
import { WithId } from "mongodb";
import { createFolderAtPath } from "../../db/drive";
import { stageEngine } from "../../engin";

const createProject = new Hono();

// POST /api/projects
createProject.post("/", zValidator("json", createProjectSchema), async (c) => {
  const body: any = await c.req.json();
  const projectId = generateId();
  const now = new Date();

  const db = getDB();
  const projects = db.collection<WithId<any>>("projects");

  try {
    const projectFolder: any = await createFolderAtPath('E.L.L.A/projects/' + body.name.replaceAll(' ', '_'))
    await projects.insertOne({
      _id: projectId,
      name: body.name,
      description: body.description,
      rootFolder: projectFolder,
      stage: "ingest_context",
      confidence: 0,
      metadata: {},
      created_at: now,
      updated_at: now,
    });

    stageEngine.createContext(
      projectId,
      body.name,
      projectFolder,
      body.description
    );

    // Emit event to Stage Engine
    stageEngine.emitEvent({
      name: "context_created",
      projectId: projectId,
      payload: {
        description: body.description,
        fileCount: body.files?.length || 0,
      },
    });

    stageEngine.emitEvent({
      name: "start_initial_analysis",
      projectId: projectId,
      payload: {
        description: body.description,
      }
    });

    return c.json(
      {
        projectId,
        status: "created",
        currentStage: "ingest_context",
        createdAt: now.toISOString(),
      },
      201,
    );
  } catch (err: any) {
    // console.error(err);
    return c.json(
      {
        error: {
          message: err.message,
          code: "CREATE_PROJECT_FAILED",
          timestamp: new Date().toISOString(),
        },
      },
      500,
    );
  }
});

export default createProject;
