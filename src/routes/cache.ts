// routes/cache.ts
// Cache management API endpoints

import { Hono } from "hono";
import { getDB } from "../db/mongodb/client";
import type { DBProject } from "../types/context";
import type { Context } from "../engin/types/context";
import { Stage } from "../engin/types/stages";
import { WithId } from "mongodb";
import { clearAllStageCache, clearStageCache, getCacheStatus, CacheKey, isStageCachingEnabled } from "../engin/handlers/planHandler/stageCache";

const cacheRoutes = new Hono();

/**
 * Helper to get context from database
 */
async function getContextFromDB(projectId: string): Promise<Context | null> {
    const db = getDB();
    const projects = db.collection<WithId<DBProject>>("projects");

    const project = await projects.findOne({ _id: projectId });
    if (!project) return null;

    // Construct context from DB project
    const context: Context = {
        projectId: project._id,
        projectName: project.metadata?.name || project._id,
        stage: project.stage as Stage,
        driveFolderId: project.metadata?.driveFolderId || "",
        planningData: project.metadata?.planningData,
        implementationData: project.metadata?.implementationData,
        artifacts: []
    };

    return context;
}

/**
 * GET /cache/status/:projectId
 * Get cache status for a project
 */
cacheRoutes.get("/status/:projectId", async (c) => {
    try {
        const { projectId } = c.req.param();

        const context = await getContextFromDB(projectId);
        if (!context) {
            return c.json({ error: "Project not found" }, 404);
        }

        const status = getCacheStatus(context);
        const enabled = isStageCachingEnabled();

        return c.json({
            enabled,
            projectId,
            cacheStatus: status,
            message: enabled
                ? "Stage caching is enabled"
                : "Stage caching is disabled (set ENABLE_STAGE_CACHE=true to enable)"
        });

    } catch (error: any) {
        return c.json({ error: error.message }, 500);
    }
});

/**
 * DELETE /cache/clear/:projectId
 * Clear all cached stages for a project
 */
cacheRoutes.delete("/clear/:projectId", async (c) => {
    try {
        const { projectId } = c.req.param();

        const context = await getContextFromDB(projectId);
        if (!context) {
            return c.json({ error: "Project not found" }, 404);
        }

        clearAllStageCache(context);

        return c.json({
            success: true,
            message: `All stage cache cleared for project ${projectId}`
        });

    } catch (error: any) {
        return c.json({ error: error.message }, 500);
    }
});

/**
 * DELETE /cache/clear/:projectId/:stage
 * Clear specific stage cache for a project
 */
cacheRoutes.delete("/clear/:projectId/:stage", async (c) => {
    try {
        const { projectId, stage } = c.req.param();

        const context = await getContextFromDB(projectId);
        if (!context) {
            return c.json({ error: "Project not found" }, 404);
        }

        // Validate stage key
        const validStages = Object.keys(CacheKey);
        if (!validStages.includes(stage.toUpperCase())) {
            return c.json({
                error: `Invalid stage. Valid stages: ${validStages.join(", ")}`
            }, 400);
        }

        const cacheKey = CacheKey[stage.toUpperCase() as keyof typeof CacheKey];
        clearStageCache(context, cacheKey);

        return c.json({
            success: true,
            message: `Cache cleared for stage ${stage} in project ${projectId}`
        });

    } catch (error: any) {
        return c.json({ error: error.message }, 500);
    }
});

export default cacheRoutes;
