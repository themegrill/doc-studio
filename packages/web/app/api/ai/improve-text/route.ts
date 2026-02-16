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
    const { text, context } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 },
      );
    }

    // Improve text using Claude with settings from database
    const { text: improvedText, usage } = await generateText({
      model: anthropic(config.defaultModel),
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
      temperature: config.temperature,
      maxTokens: Math.min(config.maxTokens, 300),
    });

    const result = improvedText.trim();

    // Log usage for tracking
    await logAIUsage({
      userId: session?.user?.id,
      feature: "textGeneration",
      model: config.defaultModel,
      promptTokens: usage?.promptTokens || usage?.inputTokens || 0,
      completionTokens: usage?.completionTokens || usage?.outputTokens || 0,
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
