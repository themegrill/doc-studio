import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validateAIFeature, getAIConfig } from "@/lib/ai-config";
import { logAIUsage } from "@/lib/ai-usage-tracker";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const session = await auth();
  const startTime = Date.now();

  try {
    // Validate feature is enabled and configured
    const validation = await validateAIFeature("titleGeneration");
    if (validation) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status }
      );
    }

    // Get AI configuration from settings
    const config = await getAIConfig();

    // Parse request body
    const body = await req.json();
    const { content, currentTitle } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 },
      );
    }

    // Generate title using Claude with settings from database
    const { text, usage } = await generateText({
      model: anthropic(config.defaultModel),
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
      temperature: config.temperature,
      maxTokens: Math.min(config.maxTokens, 100), // Titles don't need many tokens
    });

    const generatedTitle = text.trim();

    // Log usage for tracking
    await logAIUsage({
      userId: session?.user?.id,
      feature: "titleGeneration",
      model: config.defaultModel,
      promptTokens: usage?.promptTokens || usage?.inputTokens || 0,
      completionTokens: usage?.completionTokens || usage?.outputTokens || 0,
      durationMs: Date.now() - startTime,
      success: true,
    });

    return NextResponse.json({ title: generatedTitle });
  } catch (error) {
    console.error("[Generate Title API] Error:", error);

    // Log failed attempt
    const config = await getAIConfig();
    await logAIUsage({
      userId: session?.user?.id,
      feature: "titleGeneration",
      model: config.defaultModel,
      promptTokens: 0,
      completionTokens: 0,
      durationMs: Date.now() - startTime,
      success: false,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      {
        error: "Failed to generate title",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
