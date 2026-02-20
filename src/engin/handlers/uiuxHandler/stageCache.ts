// uiuxHandler/stageCache.ts
// Stage caching for Screen 2 UI/UX workflow
// Stores cache in JSON files at .stage-cache/uiux-<projectId>.json

import { Context } from "../../types/context";
import { log } from "./utils";
import * as path from "path";
import * as fs from "fs";

/**
 * Cache keys for Screen 2 UI/UX workflow stages
 */
export enum UIUXCacheKey {
    MOOD_RECOMMENDATION = "cache:mood_recommendation",
    KEY_SCREENS = "cache:key_screens",
    SCREEN_BRIEFS = "cache:screen_briefs",
    DESIGN_PROMPTS = "cache:design_prompts",
    SCREEN_VARIANTS = "cache:screen_variants",
    INSPIRATIONS = "cache:inspirations",
    TASTE_ANALYSIS = "cache:taste_analysis",
    DESIGN_TOKENS = "cache:design_tokens",
}

/**
 * Cache directory path
 */
const CACHE_DIR = path.join(process.cwd(), ".stage-cache");

/**
 * Get cache file path for Screen 2
 */
function getCacheFilePath(projectId: string): string {
    return path.join(CACHE_DIR, `uiux-cache.json`);
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
 * Load cache file
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
        log(`❌ Failed to read UIUX cache file: ${error}`);
        return {};
    }
}

/**
 * Save cache file
 */
function saveCacheFile(projectId: string, cache: Record<string, any>): void {
    ensureCacheDir();
    const filePath = getCacheFilePath(projectId);

    try {
        fs.writeFileSync(filePath, JSON.stringify(cache, null, 2), "utf-8");
    } catch (error) {
        log(`❌ Failed to write UIUX cache file: ${error}`);
    }
}

/**
 * Check if Screen 2 caching is enabled
 */
export function isUIUXCachingEnabled(): boolean {
    return process.env.ENABLE_STAGE_CACHE === "true";
}

/**
 * Get cached result for a Screen 2 stage
 */
export function getCachedUIUXStage<T = any>(
    context: Context,
    key: UIUXCacheKey
): T | null {
    if (!isUIUXCachingEnabled()) return null;

    try {
        const cache = loadCacheFile(context.projectId);
        const cached = cache[key];

        if (!cached) return null;

        log(`✅ UIUX Cache HIT: ${key}`);
        return cached.data as T;
    } catch (error) {
        log(`❌ UIUX cache read error for ${key}: ${error}`);
        return null;
    }
}

/**
 * Store result for a Screen 2 stage
 */
export function setCachedUIUXStage<T = any>(
    context: Context,
    key: UIUXCacheKey,
    data: T
): void {
    if (!isUIUXCachingEnabled()) return;

    try {
        const cache = loadCacheFile(context.projectId);

        cache[key] = {
            data,
            timestamp: new Date().toISOString(),
            cachedAt: Date.now(),
        };

        saveCacheFile(context.projectId, cache);
        log(`💾 UIUX Cached: ${key}`);
    } catch (error) {
        log(`❌ Failed to cache UIUX ${key}: ${error}`);
    }
}

/**
 * Clear all Screen 2 cache
 */
export function clearUIUXCache(context: Context): void {
    const filePath = getCacheFilePath(context.projectId);

    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            log(`🧹 Deleted UIUX cache file`);
        }
    } catch (error) {
        log(`❌ Failed to delete UIUX cache file: ${error}`);
    }
}

/**
 * Check if a Screen 2 stage has cached data
 */
export function hasUIUXCachedStage(context: Context, key: UIUXCacheKey): boolean {
    if (!isUIUXCachingEnabled()) return false;

    const cache = loadCacheFile(context.projectId);
    return cache[key] !== undefined;
}
