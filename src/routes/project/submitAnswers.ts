import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getDB } from "../../db/client";
import { submitAnswersSchema } from "../../utils/validation";
import { stageEngine } from "../../mocks/stage-engine";
import { wsManager } from "../../websocket/manager";
import type { DBProject, ProjectMetadata } from "../../types/context";
import { WithId } from "mongodb";

const submitAnswers = new Hono();

// POST /api/projects/:id/answers
submitAnswers.post(
  "/:id/answers",
  zValidator("json", submitAnswersSchema),
  async (c) => {
    const id = c.req.param("id");
    const { answers } = (await c.req.json()) as any;
    const db = getDB();
    const projects = db.collection<WithId<DBProject>>("projects");

    try {
      const project = await projects.findOne({ _id: id });
      if (!project)
        return c.json(
          { error: { message: "Project not found", code: "NOT_FOUND" } },
          404,
        );

      // Update logic would typically involve complex merging, for now we just bump confidence
      const currentMetadata = project.metadata as ProjectMetadata;
      const updatedMetadata = { ...currentMetadata, lastAnswers: answers };
      const newConfidence = Math.min((project.confidence || 0) + 20, 100);

      await projects.findOneAndUpdate(
        { _id: id },
        {
          $set: {
            metadata: updatedMetadata,
            confidence: newConfidence,
            updated_at: new Date(),
          },
        },
      );

      stageEngine.emitEvent({
        type: "answers_provided",
        projectId: id,
        payload: { answers },
      });

      // Notify connected clients
      wsManager.broadcast(id, {
        type: "update",
        timestamp: new Date().toISOString(),
        data: {
          message: "Answers received, processing...",
          progress: newConfidence,
        },
      });

      return c.json({
        success: true,
        updatedConfidence: newConfidence,
        nextAction: newConfidence > 80 ? "ready_to_plan" : "waiting",
      });
    } catch (err: any) {
      return c.json(
        { error: { message: err.message, code: "UPDATE_ERROR" } },
        500,
      );
    }
  },
);

export default submitAnswers;
