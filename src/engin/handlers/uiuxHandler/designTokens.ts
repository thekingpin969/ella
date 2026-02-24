// uiuxHandler/designTokens.ts
// Design token extraction for Screen 2

import { Context } from "../../types/context";
import { wsManager } from "../../../websocket/manager";
import { DesignTokens } from "./types";
import { callLLMWithLogging, log, safeJSONParse } from "./utils";
import { getCachedUIUXStage, setCachedUIUXStage, UIUXCacheKey } from "./stageCache";
import { PROMPTS } from "../../prompts/prompts";

/**
 * Extract design tokens from selected screen variants
 */
export async function extractDesignTokens(context: Context): Promise<DesignTokens> {
    log('Extracting design tokens from selected screens...');

    // Check cache first
    const cached = getCachedUIUXStage<DesignTokens>(context, UIUXCacheKey.DESIGN_TOKENS);
    if (cached) {
        log('Using cached design tokens');
        return cached;
    }

    const uiuxData = context.planningData?.uiuxData;
    if (!uiuxData) {
        return getDefaultDesignTokens();
    }

    // Get selected variants
    const selectedVariants = uiuxData.screenVariants.filter(v => v.status === 'selected');

    if (selectedVariants.length === 0) {
        log('No selected variants, using defaults based on mood');
        const tokens = getTokensForMood(uiuxData.mood || 'minimal');
        setCachedUIUXStage(context, UIUXCacheKey.DESIGN_TOKENS, tokens);
        return tokens;
    }

    // Combine all CSS for analysis
    const combinedCSS = selectedVariants
        .map(v => v.cssContent + '\n' + extractStyleFromHTML(v.htmlContent))
        .join('\n\n');

    // Build analysis context
    const analysisContext = `
## Mood: ${uiuxData.mood}

## Design Signature: ${uiuxData.tasteAnalysis?.designSignature || 'Modern, clean design'}

## Combined Styles from Selected Screens:
${combinedCSS.substring(0, 5000)}
`;

    const response = await callLLMWithLogging(
        context.projectId,
        'Extract Design Tokens',
        [
            { role: 'system', content: PROMPTS.DESIGN_TOKENS_PROMPT },
            { role: 'user', content: analysisContext }
        ],
        { temperature: 0.5, max_tokens: 2000 }
    );

    const tokens = safeJSONParse<DesignTokens>(response.content, getDefaultDesignTokens());

    // Cache the result
    setCachedUIUXStage(context, UIUXCacheKey.DESIGN_TOKENS, tokens);

    log('Design tokens extracted successfully');
    return tokens;
}

/**
 * Extract <style> content from HTML
 */
function extractStyleFromHTML(html: string): string {
    const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    return styleMatch ? styleMatch[1] : '';
}

/**
 * Get tokens for a specific mood
 */
function getTokensForMood(mood: string): DesignTokens {
    const moodTokens: Record<string, Partial<DesignTokens>> = {
        dark: {
            colors: {
                primary: '#6366f1',
                secondary: '#ec4899',
                background: '#0f172a',
                surface: '#1e293b',
                text: { primary: '#f8fafc', secondary: '#e2e8f0', muted: '#94a3b8' },
                border: '#334155',
                success: '#22c55e',
                warning: '#f59e0b',
                error: '#ef4444'
            }
        },
        minimal: {
            colors: {
                primary: '#3b82f6',
                secondary: '#8b5cf6',
                background: '#ffffff',
                surface: '#f8fafc',
                text: { primary: '#0f172a', secondary: '#334155', muted: '#64748b' },
                border: '#e2e8f0',
                success: '#10b981',
                warning: '#f59e0b',
                error: '#ef4444'
            }
        },
        bold: {
            colors: {
                primary: '#dc2626',
                secondary: '#f97316',
                background: '#18181b',
                surface: '#27272a',
                text: { primary: '#fafafa', secondary: '#e4e4e7', muted: '#a1a1aa' },
                border: '#3f3f46',
                success: '#22c55e',
                warning: '#eab308',
                error: '#ef4444'
            }
        },
        soft: {
            colors: {
                primary: '#8b5cf6',
                secondary: '#ec4899',
                background: '#faf5ff',
                surface: '#ffffff',
                text: { primary: '#3b0764', secondary: '#6b21a8', muted: '#a855f7' },
                border: '#e9d5ff',
                success: '#22c55e',
                warning: '#f59e0b',
                error: '#ef4444'
            }
        },
        corporate: {
            colors: {
                primary: '#1d4ed8',
                secondary: '#0891b2',
                background: '#f8fafc',
                surface: '#ffffff',
                text: { primary: '#1e293b', secondary: '#475569', muted: '#94a3b8' },
                border: '#cbd5e1',
                success: '#059669',
                warning: '#d97706',
                error: '#dc2626'
            }
        }
    };

    const baseTokens = getDefaultDesignTokens();
    const moodColors = moodTokens[mood]?.colors || moodTokens.minimal?.colors;

    return {
        ...baseTokens,
        colors: moodColors as DesignTokens['colors']
    };
}

/**
 * Get default design tokens
 */
function getDefaultDesignTokens(): DesignTokens {
    return {
        colors: {
            primary: '#6366f1',
            secondary: '#ec4899',
            background: '#0f172a',
            surface: '#1e293b',
            text: {
                primary: '#f8fafc',
                secondary: '#e2e8f0',
                muted: '#94a3b8'
            },
            border: '#334155',
            success: '#22c55e',
            warning: '#f59e0b',
            error: '#ef4444'
        },
        typography: {
            fontFamily: {
                sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                mono: "'Fira Code', 'Consolas', monospace"
            },
            fontSize: {
                xs: '0.75rem',
                sm: '0.875rem',
                base: '1rem',
                lg: '1.125rem',
                xl: '1.25rem',
                '2xl': '1.5rem',
                '3xl': '1.875rem',
                '4xl': '2.25rem'
            },
            fontWeight: {
                normal: 400,
                medium: 500,
                semibold: 600,
                bold: 700
            },
            lineHeight: {
                tight: '1.25',
                normal: '1.5',
                relaxed: '1.75'
            }
        },
        spacing: {
            xs: '0.25rem',
            sm: '0.5rem',
            md: '1rem',
            lg: '1.5rem',
            xl: '2rem',
            '2xl': '3rem',
            '3xl': '4rem'
        },
        borderRadius: {
            none: '0',
            sm: '0.25rem',
            md: '0.5rem',
            lg: '1rem',
            xl: '1.5rem',
            full: '9999px'
        },
        shadows: {
            sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
            md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            xl: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            glow: '0 0 20px rgba(99, 102, 241, 0.3)'
        },
        breakpoints: {
            sm: '640px',
            md: '768px',
            lg: '1024px',
            xl: '1280px',
            '2xl': '1536px'
        },
        animation: {
            duration: {
                fast: '150ms',
                normal: '300ms',
                slow: '500ms'
            },
            easing: {
                default: 'cubic-bezier(0.4, 0, 0.2, 1)',
                in: 'cubic-bezier(0.4, 0, 1, 1)',
                out: 'cubic-bezier(0, 0, 0.2, 1)',
                inOut: 'cubic-bezier(0.4, 0, 0.2, 1)'
            }
        }
    };
}


