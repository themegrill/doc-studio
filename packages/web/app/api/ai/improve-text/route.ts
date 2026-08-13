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
    const validation = await validateAIFeature("textGeneration");
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
    const { text, context, projectSlug } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 },
      );
    }

    // Rules come from the shared editorial ruleset, so improving a title applies
    // the same length and phrasing rules the editor checks live.
    const { system: guidelineRules } = await buildGuidelinePrompt(
      context === "title" ? "title" : "description",
      projectSlug,
    );

    // Improve text using Claude with settings from database
    const anthropic = createAnthropic({ apiKey: config.apiKey });
    const { text: improvedText, usage } = await generateText({
      model: anthropic(config.defaultModel),
      system: `You are a writing assistant improving an existing ${
        context === "title" ? "document title" : "document description"
      } for clarity, grammar and professionalism.

${guidelineRules}

Additional rules:
- Fix grammar and spelling errors.
- Improve clarity and readability.
- Maintain the original meaning — this is an edit, not a rewrite.`,
      prompt: `Improve this ${context}:

${text}`,
      temperature: config.temperature,
      maxOutputTokens: Math.min(config.maxTokens, 300),
    });

    const result = improvedText.trim();

    // Log usage for tracking
    await logAIUsage({
      userId: session?.user?.id,
      feature: "textGeneration",
      model: config.defaultModel,
      promptTokens: usage?.inputTokens || 0,
      completionTokens: usage?.outputTokens || 0,
      durationMs: Date.now() - startTime,
      success: true,
    });

    return NextResponse.json({ improvedText: result });
  } catch (error) {
    console.error("[Improve Text API] Error:", error);

    // Log failed attempt
    const config = await getAIConfig();
    await logAIUsage({
      userId: session?.user?.id,
      feature: "textGeneration",
      model: config.defaultModel,
      promptTokens: 0,
      completionTokens: 0,
      durationMs: Date.now() - startTime,
      success: false,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      {
        error: "Failed to improve text",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
