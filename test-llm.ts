// test/test-llm.ts
import { log } from "console";
import { CloudflareProvider, llmService } from "./src/llm";
import { RegisterTools, toolExecutor } from "./src/tools";

async function testLLM() {
    console.log("🧪 Testing LLM Service with Tools\n");
    RegisterTools()
    try {
        // 1. Simple chat (no tools)
        console.log("1️⃣ Simple Chat:");
        const simpleResponse = await llmService.chat({
            messages: [
                { role: "system", content: "You are E.L.L.A, a helpful AI assistant." },
                { role: "user", content: "Hi! What can you do?" }
            ]
        });
        console.log("Response:", simpleResponse.content);
        console.log();

        // 2. Chat with tools
        console.log("2️⃣ Chat with Tools:");
        const tools = toolExecutor.getToolDefinitions();
        console.log("Tools available:", tools.length);
        const toolResponse = await llmService.chat({
            messages: [
                { role: "system", content: "You are E.L.L.A. You have access to many tools." },
                { role: "user", content: "What tools do you have access to? List them briefly." }
            ],
            tools,
            tool_choice: "auto"
        });

        console.log("Response:", toolResponse.content);
        console.log("Tool calls:", toolResponse.tool_calls?.length || 0);
        console.log();

        // 3. Test tool calling
        console.log("3️⃣ Test Tool Calling:");
        const toolCallResponse = await llmService.chat({
            messages: [
                { role: "system", content: "You are E.L.L.A. Use tools when appropriate." },
                { role: "user", content: "store a coding patten in the memory" }
            ],
            tools,
            tool_choice: "auto"
        });

        if (toolCallResponse.tool_calls) {
            console.log("✅ LLM wants to call tools:");
            toolCallResponse.tool_calls.forEach(tc => {
                console.log(`   - ${tc.function.name}(${tc.function.arguments})`);
            });
        } else {
            console.log("No tool calls");
        }
        console.log();

        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("✅ LLM Service Working!");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    } catch (error: any) {
        console.error("❌ Test Failed:", error.message);
        console.error("\nTroubleshooting:");
        console.error("1. Check GEMINI_API_KEY in .env");
        console.error("2. Get free key at: https://aistudio.google.com/apikey");
        console.error("3. Verify model name is correct\n");
    }
}

// testLLM();

// Simple chat
// const response = await llmService.chat({
//     messages: [
//         { role: "system", content: "You are E.L.L.A, a helpful AI assistant" },
//         { role: "user", content: "Plan a new authentication feature" }
//     ],
//     temperature: 0.7
// });

// console.log(response.content);
RegisterTools()
const response = await llmService.chat({
    messages: [
        { role: "system", content: "You are E.L.L.A, a helpful AI assistant" },
        { role: "user", content: "show me your tools then store a coding patten in the memory then send a hi to user in same row with out waiting for responce" }
        // { role: "user", content: "who are you" }
    ],
    tools: toolExecutor.getToolDefinitions(),
    tool_choice: "auto"
});

// const em = await new CloudflareProvider().generateEmbeddings(['hi'])
// log(em)
// log(response)
// Handle tool calls
// if (response.tool_calls) {

// }

// log(response)
// log(response.tool_calls, response.tool_calls?.[0])

