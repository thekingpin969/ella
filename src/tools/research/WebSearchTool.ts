import { LLMRequest, ToolCall } from "../../llm/types";
import { llmService } from "../../llm";
import { SearchResult, ResearchResult } from "./types";

export class WebSearchTool {
    name = "web_search";
    description = "Fast, targeted web searches for specific information";

    /**
     * Execute a web search query using Claude's web search capability
     */
    async search(query: string, maxResults: number = 5): Promise<ResearchResult> {
        try {
            console.log(`[WebSearch] Executing: "${query}"`);

            const request: LLMRequest = {
                messages: [
                    {
                        role: "user",
                        content: query
                    }
                ],
                tools: [
                    {
                        type: "web_search_20250305",
                        name: "web_search"
                    }
                ],
                temperature: 0.3,
                // max_tokens: 4000
            };

            const response = await llmService.chat(request);

            // Parse search results
            const results = this.parseSearchResults(response);

            // Count tool calls
            const toolCallsUsed = response.tool_calls?.length || 1;

            console.log(`[WebSearch] Found ${results.length} results`);

            return {
                success: true,
                query,
                timestamp: new Date().toISOString(),
                researchType: "web_search",
                toolCallsUsed,
                results: results.slice(0, maxResults)
            };

        } catch (error: any) {
            console.error("[WebSearch] Error:", error);
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
     * Parse search results from LLM response
     */
    private parseSearchResults(response: any): SearchResult[] {
        const results: SearchResult[] = [];

        if (response.content) {
            // Extract information from the text response
            results.push({
                content: response.content,
                type: "text"
            });
        }

        return results;
    }
}
