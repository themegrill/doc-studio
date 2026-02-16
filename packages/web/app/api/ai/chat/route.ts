import { anthropic } from "@ai-sdk/anthropic";
import { streamText, convertToModelMessages } from "ai";
import {
  injectDocumentStateMessages,
  toolDefinitionsToToolSet,
  aiDocumentFormats,
} from "@blocknote/xl-ai/server";
import { auth } from "@/lib/auth";
import { validateAIFeature, getAIConfig } from "@/lib/ai-config";
import { logAIUsage } from "@/lib/ai-usage-tracker";

export const maxDuration = 30;

export async function POST(req: Request) {
  const session = await auth();
  const startTime = Date.now();

  try {
    // Validate feature is enabled
    const validation = await validateAIFeature("chat");
    if (validation) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: validation.status, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get AI configuration
    const config = await getAIConfig();

    // Get API key from environment or database
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Anthropic API key not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Parse request body
    const body = await req.json();
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

    // Convert BlockNote tool definitions to AI SDK format
    const tools = toolDefinitions
      ? toolDefinitionsToToolSet(toolDefinitions)
      : undefined;

    // Create streaming response using Anthropic's Claude with config settings
    const result = streamText({
      model: anthropic(config.defaultModel),
      system: aiDocumentFormats.html.systemPrompt,
      messages: modelMessages,
      tools,
      toolChoice: "auto", // Allow AI to choose: text response or tool use
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      onFinish: async (result) => {
        const usage = result.usage;
        const promptTokens = usage?.promptTokens || usage?.inputTokens || 0;
        const completionTokens = usage?.completionTokens || usage?.outputTokens || 0;

        try {
          await logAIUsage({
            userId: session?.user?.id,
            feature: "chat",
            model: config.defaultModel,
            promptTokens,
            completionTokens,
            durationMs: Date.now() - startTime,
            success: true,
          });
        } catch (err) {
          console.error("[Chat API] Failed to log usage:", err);
        }
      },
    });

    // Return UI message stream response for chat interfaces
    // This format is required for DefaultChatTransport to properly display messages
    const response = result.toUIMessageStreamResponse();

    // Ensure proper headers for streaming
    response.headers.set("x-vercel-ai-data-stream", "v1");

    return response;
  } catch (error) {
    console.error("[AI Chat API] Error:", error);

    // Log failed attempt
    const config = await getAIConfig();
    await logAIUsage({
      userId: session?.user?.id,
      feature: "chat",
      model: config.defaultModel,
      promptTokens: 0,
      completionTokens: 0,
      durationMs: Date.now() - startTime,
      success: false,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    return new Response(
      JSON.stringify({
        error: "Failed to process AI request",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
