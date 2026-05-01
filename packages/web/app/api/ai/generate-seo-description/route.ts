import { createAnthropic } from "@ai-sdk/anthropic";
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
    const validation = await validateAIFeature("descriptionGeneration");
    if (validation) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const config = await getAIConfig();
    const body = await req.json();
    const { content, docTitle, currentMetaDescription } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const anthropic = createAnthropic({ apiKey: config.apiKey });
    const { text, usage } = await generateText({
      model: anthropic(config.defaultModel),
      system: `You are an SEO expert writing meta descriptions for documentation pages.
A good meta description:
- Is 140–160 characters (strict maximum 160)
- Summarises the page value and entices the reader to click
- Includes the primary keyword naturally
- Is written in active voice
- Does NOT start with the page title verbatim
- Returns ONLY the description text — no quotes, no explanation`,
      prompt: `Write an SEO meta description for this documentation page.

Page title: ${docTitle || "Untitled"}
${currentMetaDescription ? `Current meta description: "${currentMetaDescription}"\n` : ""}
Content excerpt:
${content}

Output a single meta description, max 160 characters.`,
      temperature: 0.4,
      maxOutputTokens: 120,
    });

    const metaDescription = text.trim().replace(/^["']|["']$/g, "").slice(0, 160);

    await logAIUsage({
      userId: session?.user?.id,
      feature: "descriptionGeneration",
      model: config.defaultModel,
      promptTokens: usage?.inputTokens || 0,
      completionTokens: usage?.outputTokens || 0,
      durationMs: Date.now() - startTime,
      success: true,
    });

    return NextResponse.json({ metaDescription });
  } catch (error) {
    console.error("[generate-seo-description] Error:", error);
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
      { error: "Failed to generate SEO description" },
      { status: 500 }
    );
  }
}
