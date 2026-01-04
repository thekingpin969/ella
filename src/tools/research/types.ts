export interface ResearchResult {
    success: boolean;
    query: string;
    timestamp: string;
    researchType: "web_search" | "deep_research";
    toolCallsUsed: number;
    results?: SearchResult[] | ResearchReport;
    error?: string;
}

export interface SearchResult {
    content: string;
    type: string;
    source?: string;
    relevance?: number;
}

export interface ResearchReport {
    topic: string;
    sections: ReportSection[];
    summary: string;
    totalSources: number;
    confidence: number;
    risks?: RiskItem[];
    artifacts?: ArtifactInfo[];
}

export interface ReportSection {
    title: string;
    content: string;
    confidence: number;
    sources: number;
}

export interface RiskItem {
    level: "low" | "medium" | "high";
    description: string;
}

export interface ArtifactInfo {
    name: string;
    type: string;
    content: any;
}
