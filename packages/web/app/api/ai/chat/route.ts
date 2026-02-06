import { anthropic } from "@ai-sdk/anthropic";
import { streamText, convertToModelMessages } from "ai";
import {
  injectDocumentStateMessages,
  toolDefinitionsToToolSet,
  aiDocumentFormats,
} from "@blocknote/xl-ai/server";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    // Get API key from environment
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Anthropic API key not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Parse request body
    const body = await req.json();
    console.log("[AI Chat API] Request body:", JSON.stringify(body, null, 2));

    const { messages, toolDefinitions } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Invalid request: messages array required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Inject document state and convert to model messages
    // This follows the official BlockNote AI example
    const modelMessages = await convertToModelMessages(
      injectDocumentStateMessages(messages),
    );

    console.log("[AI Chat API] Converted model messages:", modelMessages);

    // Convert BlockNote tool definitions to AI SDK format
    const tools = toolDefinitions
      ? toolDefinitionsToToolSet(toolDefinitions)
      : undefined;

    console.log(
      "[AI Chat API] Tools available:",
      tools ? Object.keys(tools) : "none",
    );

    // Create streaming response using Anthropic's Claude
    const result = streamText({
      model: anthropic("claude-sonnet-4-5"),
      system: aiDocumentFormats.html.systemPrompt,
      messages: modelMessages,
      tools,
      toolChoice: "auto", // Allow AI to choose: text response or tool use
      temperature: 0.7,
    });

    console.log("[AI Chat API] Stream result created, returning response...");
    console.log("[AI Chat API] Response method: toUIMessageStreamResponse");

    // Return UI message stream response for chat interfaces
    // This format is required for DefaultChatTransport to properly display messages
    const response = result.toUIMessageStreamResponse();

    // Ensure proper headers for streaming
    response.headers.set("x-vercel-ai-data-stream", "v1");

    return response;
  } catch (error) {
    console.error("[AI Chat API] Error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to process AI request",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
