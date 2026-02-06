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
    const { content, title, currentDescription } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 },
      );
    }

    console.log("[Generate Description API] Generating description for:", title || "Untitled");

    // Generate description using Claude
    const { text } = await generateText({
      model: anthropic("claude-sonnet-4-5"),
      system: `You are a helpful assistant that generates concise, informative descriptions for documentation pages.
The description should be:
- Brief but informative (1-2 sentences, max 150 characters)
- Summarize the main topic or purpose
- Professional and suitable for technical documentation
- Not repeat the title verbatim
- Return ONLY the description text, nothing else`,
      prompt: `Based on this documentation content, generate a clear and concise description:

Title: ${title || "Untitled"}

Content:
${content}

${currentDescription ? `Current description: "${currentDescription}"\n\n` : ""}Generate a better description that summarizes this content.`,
      temperature: 0.7,
    });

    const generatedDescription = text.trim();
    console.log("[Generate Description API] Generated description:", generatedDescription);

    return NextResponse.json({ description: generatedDescription });
  } catch (error) {
    console.error("[Generate Description API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate description",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
