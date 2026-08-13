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
    // Validate feature is enabled
    const validation = await validateAIFeature("descriptionGeneration");
    if (validation) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status }
      );
    }

    // Get AI configuration
    const config = await getAIConfig();

    // Parse request body
    const body = await req.json();
    const { content, title, currentDescription, projectSlug } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 },
      );
    }

    // Rules come from the shared editorial ruleset (see lib/editorial/prompt.ts).
    const { system } = await buildGuidelinePrompt("description", projectSlug);

    // Generate description using Claude with settings from database
    const anthropic = createAnthropic({ apiKey: config.apiKey });
    const { text, usage } = await generateText({
      model: anthropic(config.defaultModel),
      system,
      prompt: `Based on this documentation content, generate a clear and concise description:

Title: ${title || "Untitled"}

Content:
${content}

${
  currentDescription ? `Current description: "${currentDescription}"\n\n` : ""
}Generate a better description that summarizes this content.`,
      temperature: config.temperature,
      maxOutputTokens: config.maxTokens, // Descriptions don't need many tokens
    });

    const generatedDescription = text.trim();

    // Log usage for tracking
    await logAIUsage({
      userId: session?.user?.id,
      feature: "descriptionGeneration",
      model: config.defaultModel,
      promptTokens: usage?.inputTokens || 0,
      completionTokens: usage?.outputTokens || 0,
      durationMs: Date.now() - startTime,
      success: true,
    });

    return NextResponse.json({ description: generatedDescription });
  } catch (error) {
    console.error("[Generate Description API] Error:", error);

    // Log failed attempt
    const config = await getAIConfig();
    await logAIUsage({
      userId: session?.user?.id,
      feature: "descriptionGeneration",
      model: config.defaultModel,
      promptTokens: 0,
      completionTokens: 0,
      durationMs: Date.now() - startTime,
      success: false,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      {
        error: "Failed to generate description",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
