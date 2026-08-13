import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validateAIFeature, getAIConfig } from "@/lib/ai-config";
import { logAIUsage } from "@/lib/ai-usage-tracker";
import {
  buildGuidelinePrompt,
  generateWithinBand,
} from "@/lib/editorial/ai-prompt";

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
    const { content, docTitle, currentMetaTitle, projectSlug } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    // Rules come from the shared editorial ruleset, so this route cannot drift
    // from what the SEO panel's counter shows the writer.
    const { guidelines, system } = await buildGuidelinePrompt(
      "metaTitle",
      projectSlug,
    );
    const { min, max } = guidelines.metaTitle;

    const anthropic = createAnthropic({ apiKey: config.apiKey });
    const basePrompt = `Write an SEO meta title for this documentation page.

Page title: ${docTitle || "Untitled"}
${currentMetaTitle ? `Current meta title: "${currentMetaTitle}"\n` : ""}
Content excerpt:
${content}

Output a single meta title of ${min}–${max} characters.`;

    // The model reliably respects the ceiling but undershoots the floor, so a
    // short answer is retried once rather than handed to the writer for the
    // editor to immediately flag. See generateWithinBand.
    const { text: metaTitle, inputTokens, outputTokens, retried } =
      await generateWithinBand(
        async (nudge) => {
          const { text, usage } = await generateText({
            model: anthropic(config.defaultModel),
            system,
            prompt: nudge ? `${basePrompt}\n\n${nudge}` : basePrompt,
            temperature: 0.4,
            maxOutputTokens: 120,
          });
          return {
            text,
            inputTokens: usage?.inputTokens || 0,
            outputTokens: usage?.outputTokens || 0,
          };
        },
        (raw) => raw.trim().replace(/^["']|["']$/g, "").slice(0, max),
        min,
        max,
      );

    if (retried) {
      console.log(
        `[generate-seo-title] Retried for length; final ${metaTitle.length} chars (band ${min}–${max})`,
      );
    }

    await logAIUsage({
      userId: session?.user?.id,
      feature: "titleGeneration",
      model: config.defaultModel,
      promptTokens: inputTokens,
      completionTokens: outputTokens,
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
