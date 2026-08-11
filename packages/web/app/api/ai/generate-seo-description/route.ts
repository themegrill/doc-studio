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
    const validation = await validateAIFeature("descriptionGeneration");
    if (validation) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const config = await getAIConfig();
    const body = await req.json();
    const { content, docTitle, currentMetaDescription, projectSlug } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    // Rules come from the shared editorial ruleset, so this route cannot drift
    // from what the SEO panel's counter shows the writer.
    const { guidelines, system } = await buildGuidelinePrompt(
      "metaDescription",
      projectSlug,
    );
    const { min, max } = guidelines.metaDescription;

    const anthropic = createAnthropic({ apiKey: config.apiKey });
    const basePrompt = `Write an SEO meta description for this documentation page.

Page title: ${docTitle || "Untitled"}
${currentMetaDescription ? `Current meta description: "${currentMetaDescription}"\n` : ""}
Content excerpt:
${content}

Output a single meta description of ${min}–${max} characters.`;

    // See generateWithinBand — the floor is undershot far more often than the
    // ceiling is breached, so a short answer gets one expansion attempt.
    const { text: metaDescription, inputTokens, outputTokens, retried } =
      await generateWithinBand(
        async (nudge) => {
          const { text, usage } = await generateText({
            model: anthropic(config.defaultModel),
            system,
            prompt: nudge ? `${basePrompt}\n\n${nudge}` : basePrompt,
            temperature: 0.4,
            maxOutputTokens: 200,
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
        `[generate-seo-description] Retried for length; final ${metaDescription.length} chars (band ${min}–${max})`,
      );
    }

    await logAIUsage({
      userId: session?.user?.id,
      feature: "descriptionGeneration",
      model: config.defaultModel,
      promptTokens: inputTokens,
      completionTokens: outputTokens,
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
