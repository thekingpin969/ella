// src/tools/research/WebSearchTool.ts
import { LLMRequest } from "../../llm/types";
import { logger } from "../../utils/logger";
import { llmService } from "../../llm";
import { SearchResult, ResearchResult } from "./types";
import * as cheerio from "cheerio";

const SERPER_API_KEY = process.env.SERPER_API_KEY || "";
const MAX_CONTENT_LENGTH = 5000;

interface SerperSearchResult {
    title: string;
    link: string;
    snippet: string;
}

export class WebSearchTool {
    name = "web_search";
    description = "Fast, targeted web searches for specific information";

    /**
     * Execute a web search query using Serper API + Claude
     */
    async search(query: string, maxResults: number = 5): Promise<ResearchResult> {
        try {
            logger.info(`[WebSearch] Executing: "${query}"`);

            // Step 1: Perform actual web search via Serper
            const searchResults = await this.performWebSearch(query, maxResults);

            if (searchResults.length === 0) {
                return {
                    success: false,
                    query,
                    timestamp: new Date().toISOString(),
                    researchType: "web_search",
                    toolCallsUsed: 1,
                    error: "No search results found"
                };
            }

            // Step 2: Fetch and extract content from top results
            const enrichedResults = await this.enrichResultsWithContent(searchResults);

            // Step 3: Use Claude to synthesize findings
            const synthesis = await this.synthesizeResults(query, enrichedResults);

            logger.info(`[WebSearch] Found ${enrichedResults.length} results`);

            return {
                success: true,
                query,
                timestamp: new Date().toISOString(),
                researchType: "web_search",
                toolCallsUsed: enrichedResults.length + 1, // searches + synthesis
                results: [{
                    content: synthesis,
                    type: "synthesized",
                    source: "multiple"
                }, ...enrichedResults.map(r => ({
                    content: r.content || r.snippet,
                    type: "text",
                    source: r.link
                }))]
            };

        } catch (error: any) {
            logger.error("[WebSearch] Error:", error);
            return {
                success: false,
                query,
                timestamp: new Date().toISOString(),
                researchType: "web_search",
                toolCallsUsed: 0,
                error: error.message
            };
        }
    }

    /**
     * Perform web search using Serper API
     */
    private async performWebSearch(query: string, numResults: number): Promise<SerperSearchResult[]> {
        if (!SERPER_API_KEY) {
            throw new Error("SERPER_API_KEY not configured");
        }

        try {
            const response = await fetch("https://google.serper.dev/search", {
                method: "POST",
                headers: {
                    "X-API-KEY": SERPER_API_KEY,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    q: query,
                    num: numResults,
                }),
            });

            if (!response.ok) {
                throw new Error(`Serper API error: ${response.statusText}`);
            }

            const data = await response.json();
            const results: SerperSearchResult[] = [];

            if (data.organic) {
                for (const item of data.organic.slice(0, numResults)) {
                    results.push({
                        title: item.title || "",
                        link: item.link || "",
                        snippet: item.snippet || "",
                    });
                }
            }

            return results;
        } catch (error) {
            logger.error("[WebSearch] Serper API error:", error);
            throw error;
        }
    }

    /**
     * Fetch and extract content from URLs
     */
    private async enrichResultsWithContent(
        results: SerperSearchResult[]
    ): Promise<Array<SerperSearchResult & { content?: string }>> {
        const enriched = await Promise.all(
            results.map(async (result) => {
                try {
                    const content = await this.fetchAndExtract(result.link);
                    return { ...result, content, url: result.link };
                } catch (error) {
                    logger.error(`[WebSearch] Failed to fetch ${result.link}:`, error);
                    return { ...result, url: result.link };
                }
            })
        );

        return enriched;
    }

    /**
     * Fetch webpage and extract main content
     */
    private async fetchAndExtract(url: string): Promise<string> {
        try {
            const response = await fetch(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                },
                signal: AbortSignal.timeout(10000),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const html = await response.text();
            const content = this.extractMainContent(html);
            return this.truncateContent(content, MAX_CONTENT_LENGTH);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Extract main content from HTML
     */
    private extractMainContent(html: string): string {
        const $ = cheerio.load(html);

        // Remove unwanted elements
        $("script, style, nav, header, footer, aside, iframe, noscript").remove();
        $(".advertisement, .ad, .sidebar, .comments").remove();

        // Try to find main content
        let content = "";
        const mainSelectors = [
            "article",
            "main",
            '[role="main"]',
            ".content",
            ".post-content",
            "#content",
        ];

        for (const selector of mainSelectors) {
            const element = $(selector);
            if (element.length > 0) {
                content = element.text();
                break;
            }
        }

        if (!content) {
            content = $("body").text();
        }

        return content.replace(/\s+/g, " ").trim();
    }

    /**
     * Truncate content to max length
     */
    private truncateContent(content: string, maxLength: number): string {
        if (content.length <= maxLength) {
            return content;
        }
        return content.substring(0, maxLength) + "... [content truncated]";
    }

    /**
     * Use Claude to synthesize search results
     */
    private async synthesizeResults(
        query: string,
        results: Array<SerperSearchResult & { content?: string }>
    ): Promise<string> {
        const sourcesText = results
            .map((r, i) => {
                return `Source ${i + 1}: ${r.title}\nURL: ${r.link}\nContent: ${r.content || r.snippet}\n`;
            })
            .join("\n---\n\n");

        const request: LLMRequest = {
            messages: [
                {
                    role: "system",
                    content: `You are a research assistant. Synthesize the following search results to answer the query concisely and accurately. Include key facts, relevant details, and cite sources when mentioning specific information.`
                },
                {
                    role: "user",
                    content: `Query: ${query}\n\nSearch Results:\n${sourcesText}\n\nProvide a clear, concise answer based on these sources.`
                }
            ],
            temperature: 0.3,
        };

        const response = await llmService.chat(request);
        return response.content || "No synthesis available";
    }
}