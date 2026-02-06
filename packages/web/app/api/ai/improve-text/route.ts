import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    // Get API key from environment
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Anthropic API key not configured" },
        { status: 500 },
      );
    }

    // Parse request body
    const body = await req.json();
    const { text, context } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 },
      );
    }

    console.log("[Improve Text API] Improving text:", text);

    // Improve text using Claude
    const { text: improvedText } = await generateText({
      model: anthropic("claude-sonnet-4-5"),
      system: `You are a helpful writing assistant that improves text clarity, grammar, and professionalism.
${context === "title"
  ? "You are improving a document title. Keep it concise (3-8 words) and professional."
  : "You are improving a document description. Keep it brief (1-2 sentences) and informative."
}

Rules:
- Fix grammar and spelling errors
- Improve clarity and readability
- Maintain the original meaning
- Keep it professional and suitable for documentation
- Return ONLY the improved text, nothing else (no quotes, no explanations)`,
      prompt: `Improve this ${context}:

${text}`,
      temperature: 0.7,
    });

    const result = improvedText.trim();
    console.log("[Improve Text API] Improved to:", result);

    return NextResponse.json({ improvedText: result });
  } catch (error) {
    console.error("[Improve Text API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to improve text",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
