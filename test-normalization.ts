import { normalizeTool } from "./src/llm/utils";

const flatTool = {
    name: "web_search",
    description: "Search the web",
    parameters: {
        type: "object",
        properties: {
            query: { type: "string" }
        },
        required: ["query"]
    }
};

const nestedTool = {
    type: "function",
    function: {
        name: "fetch_webpage",
        description: "Fetch a webpage",
        parameters: {
            type: "object",
            properties: {
                url: { type: "string" }
            },
            required: ["url"]
        }
    }
};

console.log("🧪 Testing normalizeTool...");

const normFlat = normalizeTool(flatTool);
console.log("\n1. Flat tool normalization:");
console.log(JSON.stringify(normFlat, null, 2));
if (normFlat.name === "web_search" && normFlat.parameters.properties.query) {
    console.log("✅ Flat tool normalized successfully");
} else {
    console.log("❌ Flat tool normalization failed");
    process.exit(1);
}

const normNested = normalizeTool(nestedTool);
console.log("\n2. Nested tool normalization:");
console.log(JSON.stringify(normNested, null, 2));
if (normNested.name === "fetch_webpage" && normNested.parameters.properties.url) {
    console.log("✅ Nested tool normalized successfully");
} else {
    console.log("❌ Nested tool normalization failed");
    process.exit(1);
}

console.log("\n✨ All normalization tests passed!");
