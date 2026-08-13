import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validateAIFeature, getAIConfig } from "@/lib/ai-config";
import { logAIUsage } from "@/lib/ai-usage-tracker";
import { buildGuidelinePrompt } from "@/lib/editorial/ai-prompt";

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
    const { content, currentTitle, projectSlug } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 },
      );
    }

    // Rules come from the shared editorial ruleset, so the generated title is
    // task-oriented and free of the "How to" prefix the editor would flag.
    const { guidelines, system } = await buildGuidelinePrompt(
      "title",
      projectSlug,
    );

    // Generate title using Claude with settings from database
    const anthropic = createAnthropic({ apiKey: config.apiKey });
    const { text, usage } = await generateText({
      model: anthropic(config.defaultModel),
      system,
      prompt: `Based on this documentation content, generate a clear and concise title:

${content}

${
  currentTitle ? `Current title: "${currentTitle}"\n\n` : ""
}Generate a better title that accurately describes this content, in at most ${guidelines.title.maxWords} words.`,
      temperature: config.temperature,
      maxOutputTokens: Math.min(config.maxTokens, 100), // Titles don't need many tokens
    });

    const generatedTitle = text.trim().replace(/^["']|["']$/g, "");

    // Log usage for tracking
    await logAIUsage({
      userId: session?.user?.id,
      feature: "titleGeneration",
      model: config.defaultModel,
      promptTokens: usage?.inputTokens || 0,
      completionTokens: usage?.outputTokens || 0,
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
