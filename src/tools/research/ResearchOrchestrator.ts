import { WebSearchTool } from "./WebSearchTool";
import { DeepResearchTool, DeepResearchOptions } from "./DeepResearchTool";
import { ResearchResult } from "./types";
import { memoryService } from "../../memory";

export class ResearchOrchestrator {
    private webSearch: WebSearchTool;
    private deepResearch: DeepResearchTool;

    constructor() {
        this.webSearch = new WebSearchTool();
        this.deepResearch = new DeepResearchTool();
        console.log("[ResearchOrchestrator] Initialized");
    }

    /**
     * Intelligent research router
     * Determines whether to use web search or deep research
     */
    async conductResearch(
        query: string,
        projectId: string,
        options: {
            complexity?: "auto" | "simple" | "complex";
            stage?: string;
        } & DeepResearchOptions = {}
    ): Promise<ResearchResult> {
        const {
            complexity = "auto",
            stage = "research",
            ...deepResearchOptions
        } = options;

        let researchType: "web_search" | "deep_research";

        if (complexity === "auto") {
            researchType = this.determineResearchType(query);
        } else {
            researchType = complexity === "simple" ? "web_search" : "deep_research";
        }

        console.log(`[ResearchOrchestrator] Query: "${query}"`);
        console.log(`[ResearchOrchestrator] Type: ${researchType}`);

        let results: ResearchResult;

        if (researchType === "web_search") {
            results = await this.webSearch.search(query);
        } else {
            results = await this.deepResearch.research(query, deepResearchOptions);
        }

        // Save to project memory
        if (results.success) {
            await this.saveToMemory(projectId, results, { stage });
        }

        return results;
    }

    /**
     * Determine research type based on query analysis
     */
    private determineResearchType(query: string): "web_search" | "deep_research" {
        const deepResearchKeywords = [
            "compare", "evaluate", "analyze", "feasibility", "architecture",
            "vs", "versus", "alternative", "options", "trade-off", "best approach",
            "comprehensive", "detailed analysis", "risk assessment"
        ];

        const simpleSearchKeywords = [
            "documentation", "docs", "version", "latest", "api reference",
            "how to", "tutorial", "example", "syntax", "install"
        ];

        const queryLower = query.toLowerCase();

        const needsDeepResearch = deepResearchKeywords.some(keyword =>
            queryLower.includes(keyword)
        );

        const needsSimpleSearch = simpleSearchKeywords.some(keyword =>
            queryLower.includes(keyword)
        );

        if (needsDeepResearch) {
            return "deep_research";
        } else if (needsSimpleSearch || query.length < 50) {
            return "web_search";
        } else {
            return "deep_research";
        }
    }

    /**
     * Batch research for multiple topics
     */
    async batchResearch(
        queries: string[],
        projectId: string,
        options: any = {}
    ): Promise<{
        success: boolean;
        timestamp: string;
        totalQueries: number;
        results: ResearchResult[];
    }> {
        console.log(`[ResearchOrchestrator] Batch research: ${queries.length} queries`);

        const results: ResearchResult[] = [];

        for (const query of queries) {
            const result = await this.conductResearch(query, projectId, options);
            results.push(result);

            // Rate limiting - wait between requests
            await this.sleep(1000);
        }

        return {
            success: true,
            timestamp: new Date().toISOString(),
            totalQueries: queries.length,
            results
        };
    }

    /**
     * Save research results to memory
     */
    private async saveToMemory(
        projectId: string,
        results: ResearchResult,
        context: any
    ): Promise<void> {
        try {
            const content = JSON.stringify({
                query: results.query,
                type: results.researchType,
                timestamp: results.timestamp,
                toolCalls: results.toolCallsUsed,
                summary: this.extractSummary(results)
            });

            await memoryService.storeProject(projectId, content, {
                type: "research_result",
                researchType: results.researchType,
                stage: context.stage,
                timestamp: results.timestamp
            });

            console.log(`[ResearchOrchestrator] Saved to memory: ${results.query}`);
        } catch (error) {
            console.error("[ResearchOrchestrator] Failed to save to memory:", error);
        }
    }

    /**
     * Extract summary from results
     */
    private extractSummary(results: ResearchResult): string {
        if (!results.success) {
            return "Research failed";
        }

        if (Array.isArray(results.results)) {
            return results.results[0]?.content?.substring(0, 200) || "";
        }

        if (results.results && 'summary' in results.results) {
            return results.results.summary;
        }

        return "";
    }

    /**
     * Sleep utility for rate limiting
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
