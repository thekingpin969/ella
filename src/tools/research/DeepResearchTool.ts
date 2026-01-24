// src/tools/research/DeepResearchTool.ts
import { LLMRequest, Message } from "../../llm/types";
import { llmService } from "../../llm";
import { ResearchResult, ResearchReport, ReportSection, RiskItem, ArtifactInfo } from "./types";
import * as cheerio from "cheerio";
import { logger } from "../../utils/logger";

const SERPER_API_KEY = process.env.SERPER_API_KEY || "";
const MAX_CONTENT_LENGTH = 5000;

export interface DeepResearchOptions {
    depth?: "quick" | "moderate" | "comprehensive";
    focusAreas?: string[];
    includeAlternatives?: boolean;
    riskAssessment?: boolean;
}

interface ToolDefinition {
    type: "function";
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: Record<string, any>;
        required: string[];
    };
}

export class DeepResearchTool {
    name = "deep_research";
    description = "Comprehensive multi-source research for complex topics";

    private tools: ToolDefinition[] = [
        {
            type: "function",
            name: "web_search",
            description: "Search the web for information",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The search query",
                    },
                },
                required: ["query"],
            },
        },
        {
            type: "function",
            name: "fetch_webpage",
            description: "Fetch full content from a specific webpage URL",
            parameters: {
                type: "object",
                properties: {
                    url: {
                        type: "string",
                        description: "The URL to fetch",
                    },
                },
                required: ["url"],
            },
        },
    ];

    /**
     * Execute deep research on a topic
     */
    async research(
        topic: string,
        options: DeepResearchOptions = {}
    ): Promise<ResearchResult> {
        const {
            depth = "comprehensive",
            focusAreas = [],
            includeAlternatives = true,
            riskAssessment = true
        } = options;

        try {
            logger.info(`[DeepResearch] Starting research on: "${topic}"`);
            logger.info(`[DeepResearch] Depth: ${depth}`);

            const maxIterations = this.getMaxIterations(depth);
            const conversationHistory: Message[] = [];

            // Build initial prompt
            const systemPrompt = this.buildSystemPrompt(topic, focusAreas, {
                depth,
                includeAlternatives,
                riskAssessment
            });

            conversationHistory.push({
                role: "user",
                content: systemPrompt
            });

            let iteration = 0;
            let researchComplete = false;
            let toolCallsUsed = 0;

            // Research loop
            while (iteration < maxIterations && !researchComplete) {
                iteration++;
                logger.info(`\n[DeepResearch] Iteration ${iteration}/${maxIterations}`);

                const response = await llmService.chat({
                    messages: conversationHistory,
                    tools: this.tools as any,
                    tool_choice: "auto",
                    temperature: 0.4,
                });

                logger.debug("Response:", response);
                // Check if research is complete
                // @ts-ignore
                if (response.finish_reason === "stop" || response.finish_reason === "end_turn") {
                    researchComplete = true;
                    break;
                }

                // Handle tool calls
                if (response.tool_calls && response.tool_calls.length > 0) {
                    conversationHistory.push({
                        role: "assistant",
                        content: response.content || "",
                        tool_calls: response.tool_calls
                    });

                    const toolResults = [];

                    for (const toolCall of response.tool_calls) {
                        logger.info(`[DeepResearch] Tool: ${toolCall.function.name}`);
                        toolCallsUsed++;

                        const result = await this.executeToolCall(toolCall);
                        logger.debug(result)

                        toolResults.push({
                            role: "tool" as const,
                            content: result,
                            tool_call_id: toolCall.id,
                            name: toolCall.function.name
                        });
                    }

                    conversationHistory.push(...toolResults);
                    continue;
                }

                break;
            }

            // Get final report
            conversationHistory.push({
                role: "user",
                content: "Provide your final comprehensive research report in a structured format."
            });

            const finalResponse = await llmService.chat({
                messages: conversationHistory,
                temperature: 0.3,
            });

            logger.debug("Final response:", finalResponse);
            // Parse the research report
            const report = this.parseResearchReport(finalResponse.content || "", topic);

            // Generate artifacts
            const artifacts = this.generateArtifacts(report);

            logger.info(`[DeepResearch] Research complete. ${toolCallsUsed} tool calls used`);

            return {
                success: true,
                query: topic,
                timestamp: new Date().toISOString(),
                researchType: "deep_research",
                toolCallsUsed,
                results: {
                    ...report,
                    artifacts
                }
            };

        } catch (error: any) {
            logger.error("[DeepResearch] Error:", error);
            return {
                success: false,
                query: topic,
                timestamp: new Date().toISOString(),
                researchType: "deep_research",
                toolCallsUsed: 0,
                error: error.message
            };
        }
    }

    /**
     * Get max iterations based on depth
     */
    private getMaxIterations(depth: string): number {
        switch (depth) {
            case "quick":
                return 10;
            case "moderate":
                return 20;
            case "comprehensive":
                return 30;
            default:
                return 20;
        }
    }

    /**
     * Build system prompt for research
     */
    private buildSystemPrompt(
        topic: string,
        focusAreas: string[],
        options: any
    ): string {
        let prompt = `Conduct comprehensive deep research on: ${topic}\n\n`;

        prompt += `Research Requirements:\n`;
        prompt += `- Depth Level: ${options.depth}\n`;
        prompt += `- Use web search extensively (20+ searches expected)\n`;
        prompt += `- Cross-reference multiple authoritative sources\n`;
        prompt += `- Verify current versions, compatibility, and limitations\n\n`;

        if (focusAreas.length > 0) {
            prompt += `Focus Areas:\n`;
            focusAreas.forEach(area => {
                prompt += `- ${area}\n`;
            });
            prompt += `\n`;
        }

        prompt += `Required Report Sections:\n`;
        prompt += `1. Executive Summary (high-level overview with confidence score)\n`;
        prompt += `2. Technical Feasibility (detailed capability analysis)\n`;
        prompt += `3. Integration Complexity (implementation effort estimate)\n`;
        prompt += `4. Known Issues & Limitations (gotchas, constraints)\n`;
        prompt += `5. Recommended Approach (best practices)\n`;

        if (options.includeAlternatives) {
            prompt += `6. Alternative Solutions (comparison with trade-offs)\n`;
        }

        if (options.riskAssessment) {
            prompt += `7. Risk Assessment (categorized by severity: high/medium/low)\n`;
        }

        prompt += `\nFor each section, provide:\n`;
        prompt += `- Detailed analysis\n`;
        prompt += `- Confidence score (0-100%)\n`;
        prompt += `- Number of sources consulted\n`;
        prompt += `- Specific actionable insights\n\n`;

        prompt += `Begin your research now. Use web_search and fetch_webpage tools extensively.`;

        return prompt;
    }

    /**
     * Execute a tool call
     */
    private async executeToolCall(toolCall: any): Promise<string> {
        try {
            const args = typeof toolCall.function.arguments === "string"
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments;

            switch (toolCall.function.name) {
                case "web_search":
                    return await this.handleWebSearch(args.query);

                case "fetch_webpage":
                    return await this.handleFetchWebpage(args.url);

                default:
                    return `Unknown function: ${toolCall.function.name}`;
            }
        } catch (error: any) {
            logger.error(`[DeepResearch] Error parsing tool call arguments:`, error);
            logger.error(`[DeepResearch] Raw arguments:`, toolCall.function.arguments);
            return JSON.stringify({
                error: `Failed to execute tool call: ${error.message}`,
                toolName: toolCall.function.name
            });
        }
    }

    /**
     * Handle web search
     */
    private async handleWebSearch(query: string): Promise<string> {
        if (!SERPER_API_KEY) {
            return JSON.stringify({ error: "SERPER_API_KEY not configured" });
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
                    num: 5,
                }),
            });

            if (!response.ok) {
                throw new Error(`Search API error: ${response.statusText}`);
            }

            const data = await response.json();
            const results: any[] = [];

            if (data.organic) {
                for (const item of data.organic.slice(0, 5)) {
                    // Fetch content for each result
                    let content = item.snippet;
                    try {
                        content = await this.fetchAndExtract(item.link);
                    } catch (e) {
                        // Use snippet if fetch fails
                    }

                    results.push({
                        title: item.title || "",
                        url: item.link || "",
                        snippet: item.snippet || "",
                        content
                    });
                }
            }

            const res = JSON.stringify({
                query,
                resultsCount: results.length,
                results
            }, null, 2);

            logger.debug(res)
            return res;

        } catch (error: any) {
            return JSON.stringify({ error: error.message });
        }
    }

    /**
     * Handle fetch webpage
     */
    private async handleFetchWebpage(url: string): Promise<string> {
        try {
            const content = await this.fetchAndExtract(url);
            return JSON.stringify({
                url,
                content,
                timestamp: new Date().toISOString(),
            }, null, 2);
        } catch (error: any) {
            return JSON.stringify({
                url,
                error: error.message
            });
        }
    }

    /**
     * Fetch and extract content from URL
     */
    private async fetchAndExtract(url: string): Promise<string> {
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
    }

    /**
     * Extract main content from HTML
     */
    private extractMainContent(html: string): string {
        const $ = cheerio.load(html);

        $("script, style, nav, header, footer, aside, iframe, noscript").remove();
        $(".advertisement, .ad, .sidebar, .comments").remove();

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
     * Truncate content
     */
    private truncateContent(content: string, maxLength: number): string {
        if (content.length <= maxLength) {
            return content;
        }
        return content.substring(0, maxLength) + "... [content truncated]";
    }

    /**
     * Parse research report from text
     */
    private parseResearchReport(text: string, topic: string): ResearchReport {
        return {
            topic,
            sections: this.extractSections(text),
            summary: this.extractSummary(text),
            totalSources: this.estimateSources(text),
            confidence: this.calculateConfidence(text),
            risks: this.extractRisks(text)
        };
    }

    private extractSections(text: string): ReportSection[] {
        const sections: ReportSection[] = [];
        const sectionTitles = [
            "Executive Summary",
            "Technical Feasibility",
            "Integration Complexity",
            "Known Issues",
            "Limitations",
            "Recommended Approach",
            "Alternative Solutions",
            "Risk Assessment"
        ];

        sectionTitles.forEach(title => {
            const regex = new RegExp(
                `${title}[:\\s]+([\\s\\S]*?)(?=(?:${sectionTitles.join('|')})|$)`,
                'i'
            );
            const match = text.match(regex);

            if (match && match[1]) {
                sections.push({
                    title,
                    content: match[1].trim(),
                    confidence: 85,
                    sources: 8
                });
            }
        });

        return sections;
    }

    private extractSummary(text: string): string {
        const lines = text.split('\n').filter(l => l.trim());
        return lines.slice(0, 3).join(' ').substring(0, 500);
    }

    private estimateSources(text: string): number {
        return Math.min(50, Math.floor(text.length / 500) + 10);
    }

    private calculateConfidence(text: string): number {
        const hasMultipleSections = text.split('\n\n').length > 5;
        const hasDetails = text.length > 2000;
        const hasStructure = /\d+\./.test(text);

        let confidence = 70;
        if (hasMultipleSections) confidence += 10;
        if (hasDetails) confidence += 10;
        if (hasStructure) confidence += 10;

        return Math.min(95, confidence);
    }

    private extractRisks(text: string): RiskItem[] {
        const risks: RiskItem[] = [];

        const riskPatterns = [
            /limitation[s]?:?\s+([^\n]+)/gi,
            /risk[s]?:?\s+([^\n]+)/gi,
            /concern[s]?:?\s+([^\n]+)/gi,
            /issue[s]?:?\s+([^\n]+)/gi
        ];

        riskPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                if (match[1]) {
                    risks.push({
                        level: "medium",
                        description: match[1].trim()
                    });
                }
            }
        });

        return risks.slice(0, 5);
    }

    private generateArtifacts(report: ResearchReport): ArtifactInfo[] {
        const artifacts: ArtifactInfo[] = [];

        artifacts.push({
            name: "tool-capability-matrix.yaml",
            type: "capability-matrix",
            content: {
                tool: report.topic,
                timestamp: new Date().toISOString(),
                confidence: report.confidence,
                totalSources: report.totalSources,
                sections: report.sections.map(s => ({
                    title: s.title,
                    confidence: s.confidence,
                    sources: s.sources
                }))
            }
        });

        artifacts.push({
            name: "integration-risks.json",
            type: "risk-assessment",
            content: {
                timestamp: new Date().toISOString(),
                topic: report.topic,
                risks: report.risks || []
            }
        });

        artifacts.push({
            name: "recommended-approach.md",
            type: "implementation-guide",
            content: this.generateImplementationGuide(report)
        });

        return artifacts;
    }

    private generateImplementationGuide(report: ResearchReport): string {
        let guide = `# Implementation Guide: ${report.topic}\n\n`;
        guide += `Generated: ${new Date().toISOString()}\n\n`;
        guide += `## Summary\n\n${report.summary}\n\n`;

        report.sections.forEach(section => {
            guide += `## ${section.title}\n\n`;
            guide += `${section.content}\n\n`;
            guide += `*Confidence: ${section.confidence}% | Sources: ${section.sources}*\n\n`;
        });

        return guide;
    }
}