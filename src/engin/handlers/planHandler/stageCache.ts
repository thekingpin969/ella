// planHandler/stageCache.ts
// Workflow stage caching for faster testing/development
// Stores cache in JSON files at .stage-cache/<projectId>.json

import { Context } from "../../types/context";
import { log } from "./utils";
import * as path from "path";
import * as fs from "fs";

/**
 * Cache keys for different stages of the planning workflow
 */
export enum CacheKey {
    GAPS_GENERATED = "cache:gaps_generated",
    GAPS_FILLED = "cache:gaps_filled",
    CONFIDENCE_CALCULATED = "cache:confidence_calculated",
    CONFIDENCE_RECALCULATED = "cache:confidence_recalculated",
    QUESTIONS_GENERATED = "cache:questions_generated",
}

/**
 * Cache directory path
 */
const CACHE_DIR = path.join(process.cwd(), ".stage-cache");

/**
 * Get cache file path for a project
 */
function getCacheFilePath(projectId: string): string {
    // return path.join(CACHE_DIR, `${projectId}.json`);
    return path.join(CACHE_DIR, `cache.json`);
}

/**
 * Ensure cache directory exists
 */
function ensureCacheDir(): void {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        log(`📁 Created cache directory: ${CACHE_DIR}`);
    }
}

/**
 * Load cache file for a project
 */
function loadCacheFile(projectId: string): Record<string, any> {
    const filePath = getCacheFilePath(projectId);

    if (!fs.existsSync(filePath)) {
        return {};
    }

    try {
        const content = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(content);
    } catch (error) {
        log(`❌ Failed to read cache file for ${projectId}:`, error);
        return {};
    }
}

/**
 * Save cache file for a project
 */
function saveCacheFile(projectId: string, cache: Record<string, any>): void {
    ensureCacheDir();
    const filePath = getCacheFilePath(projectId);

    try {
        fs.writeFileSync(filePath, JSON.stringify(cache, null, 2), "utf-8");
    } catch (error) {
        log(`❌ Failed to write cache file for ${projectId}:`, error);
    }
}

/**
 * Check if stage caching is enabled
 */
export function isStageCachingEnabled(): boolean {
    return process.env.ENABLE_STAGE_CACHE === "true";
}

/**
 * Get cached result for a stage
 */
export function getCachedStage<T = any>(
    context: Context,
    key: CacheKey
): T | null {
    if (!isStageCachingEnabled()) return null;

    try {
        const cache = loadCacheFile(context.projectId);
        const cached = cache[key];

        if (!cached) return null;

        log(`✅ Cache HIT: ${key} (from file)`);
        return cached.data as T;
    } catch (error) {
        log(`❌ Cache read error for ${key}:`, error);
        return null;
    }
}

/**
 * Store result for a stage
 */
export function setCachedStage<T = any>(
    context: Context,
    key: CacheKey,
    data: T
): void {
    if (!isStageCachingEnabled()) return;

    try {
        const cache = loadCacheFile(context.projectId);

        cache[key] = {
            data,
            timestamp: new Date().toISOString(),
            cachedAt: Date.now(),
        };

        saveCacheFile(context.projectId, cache);
        log(`💾 Cached to file: ${key}`);
    } catch (error) {
        log(`❌ Failed to cache ${key}:`, error);
    }
}

/**
 * Clear all cached stages for a project
 */
export function clearAllStageCache(context: Context): void {
    const filePath = getCacheFilePath(context.projectId);

    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            log(`🧹 Deleted cache file for project ${context.projectId}`);
        }
    } catch (error) {
        log(`❌ Failed to delete cache file:`, error);
    }
}

/**
 * Clear specific stage cache
 */
export function clearStageCache(context: Context, key: CacheKey): void {
    try {
        const cache = loadCacheFile(context.projectId);
        delete cache[key];
        saveCacheFile(context.projectId, cache);
        log(`🧹 Cleared cache: ${key}`);
    } catch (error) {
        log(`❌ Failed to clear cache ${key}:`, error);
    }
}

/**
 * Check if a stage has cached data
 */
export function hasCachedStage(context: Context, key: CacheKey): boolean {
    if (!isStageCachingEnabled()) return false;

    const cache = loadCacheFile(context.projectId);
    return cache[key] !== undefined;
}

/**
 * Get cache status for all stages
 */
export function getCacheStatus(context: Context): Record<string, boolean> {
    const status: Record<string, boolean> = {};

    for (const [name, key] of Object.entries(CacheKey)) {
        status[name] = hasCachedStage(context, key);
    }

    return status;
}
