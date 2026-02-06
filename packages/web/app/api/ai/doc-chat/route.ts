import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { messages, documentContext } = await req.json();

    // Check for API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "Anthropic API key not configured",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Build system prompt with document context
    const systemPrompt = `You are an AI assistant helping users improve their documentation. You are embedded in a documentation editor and have context about the current document.

Document Context:
- Title: ${documentContext?.title || "Untitled"}
- Description: ${documentContext?.description || "No description"}
- Content Preview: ${documentContext?.blocksPreview || "No content yet"}

Your role:
- Help users improve their documentation with constructive suggestions
- Answer questions about writing effective documentation
- Suggest content structure, clarity improvements, and best practices
- Provide actionable advice and recommendations
- Be conversational and helpful

Note: You provide advice and suggestions. For direct editing, users can use the BlockNote AI toolbar (sparkles button) which has powerful inline editing capabilities.`;

    // Convert to model messages
    if (!messages || messages.length === 0) {
      throw new Error("No messages provided");
    }

    const modelMessages = messages.map((m: any) => ({
      role: m.role,
      content: typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
        ? m.content.map((c: any) => c.text || c).join('')
        : String(m.content),
    }));

    const result = streamText({
      model: anthropic("claude-sonnet-4-5"),
      system: systemPrompt,
      messages: modelMessages,
      temperature: 0.7,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("[doc-chat] Error:", error);
    console.error("[doc-chat] Error stack:", error instanceof Error ? error.stack : "No stack");
    return new Response(
      JSON.stringify({
        error: "Failed to process chat request",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
