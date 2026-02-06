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
    const { content, currentTitle } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 },
      );
    }

    console.log("[Generate Title API] Generating title for content:", content.slice(0, 100) + "...");

    // Generate title using Claude
    const { text } = await generateText({
      model: anthropic("claude-sonnet-4-5"),
      system: `You are a helpful assistant that generates concise, descriptive titles for documentation pages.
The title should be:
- Clear and descriptive (3-8 words)
- Professional and suitable for technical documentation
- Capture the main topic or purpose of the content
- Not use quotes or special formatting
- Return ONLY the title text, nothing else`,
      prompt: `Based on this documentation content, generate a clear and concise title:

${content}

${currentTitle ? `Current title: "${currentTitle}"\n\n` : ""}Generate a better title that accurately describes this content.`,
      temperature: 0.7,
    });

    const generatedTitle = text.trim();
    console.log("[Generate Title API] Generated title:", generatedTitle);

    // Log token usage
    console.log("[Generate Title API] Request completed");

    return NextResponse.json({ title: generatedTitle });
  } catch (error) {
    console.error("[Generate Title API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate title",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
