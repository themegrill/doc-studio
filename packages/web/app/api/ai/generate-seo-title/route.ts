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
    const validation = await validateAIFeature("titleGeneration");
    if (validation) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const config = await getAIConfig();
    const body = await req.json();
    const { content, docTitle, currentMetaTitle } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const anthropic = createAnthropic({ apiKey: config.apiKey });
    const { text, usage } = await generateText({
      model: anthropic(config.defaultModel),
      system: `You are an SEO expert writing meta titles for documentation pages.
A good meta title:
- Is 50–60 characters (strict maximum 60)
- Leads with the primary keyword or topic
- Is specific, descriptive, and entices clicks in search results
- Does NOT include the site name or pipe separators
- Returns ONLY the title text — no quotes, no explanation`,
      prompt: `Write an SEO meta title for this documentation page.

Page title: ${docTitle || "Untitled"}
${currentMetaTitle ? `Current meta title: "${currentMetaTitle}"\n` : ""}
Content excerpt:
${content}

Output a single meta title, max 60 characters.`,
      temperature: 0.4,
      maxOutputTokens: 80,
    });

    const metaTitle = text.trim().replace(/^["']|["']$/g, "").slice(0, 60);

    await logAIUsage({
      userId: session?.user?.id,
      feature: "titleGeneration",
      model: config.defaultModel,
      promptTokens: usage?.inputTokens || 0,
      completionTokens: usage?.outputTokens || 0,
      durationMs: Date.now() - startTime,
      success: true,
    });

    return NextResponse.json({ metaTitle });
  } catch (error) {
    console.error("[generate-seo-title] Error:", error);
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
      { error: "Failed to generate SEO title" },
      { status: 500 }
    );
  }
}
