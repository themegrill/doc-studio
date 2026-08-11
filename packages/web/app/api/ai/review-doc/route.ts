import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { validateAIFeature, getAIConfig } from "@/lib/ai-config";
import { logAIUsage } from "@/lib/ai-usage-tracker";
import { buildGuidelinePrompt } from "@/lib/editorial/ai-prompt";
import { JUDGEMENT_ONLY_INSTRUCTION } from "@/lib/editorial/prompt";
import type { Finding } from "@/lib/editorial/rules";

export const maxDuration = 60;

/**
 * Editorial Review (DOCSTUDIO-45 §5).
 *
 * The deterministic rules in lib/editorial/rules.ts cover everything a character
 * count can decide. They cannot answer the questions the guideline actually
 * cares most about — is this title genuinely task-oriented or merely short, does
 * this category describe a user goal or our plugin architecture, does this meta
 * description say what the reader accomplishes or just restate the title.
 *
 * Findings come back in the same shape the deterministic rules emit, so the
 * editor merges both into one checklist rather than showing the writer two.
 */

const ReviewSchema = z.object({
  findings: z
    .array(
      z.object({
        field: z
          .enum(["title", "metaTitle", "metaDescription", "category", "image"])
          .describe("Which part of the page the finding is about"),
        message: z
          .string()
          .describe("What is wrong, in one sentence, addressed to the writer"),
        hint: z
          .string()
          .describe("A concrete suggested fix — ideally the rewritten text"),
      }),
    )
    .max(4),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  const startTime = Date.now();

  try {
    const validation = await validateAIFeature("editorialReview");
    if (validation) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status },
      );
    }

    const config = await getAIConfig();
    const body = await req.json();
    const {
      content,
      title,
      description,
      metaTitle,
      metaDescription,
      categoryTitle,
      projectSlug,
      alreadyReported,
    } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 },
      );
    }

    const { system } = await buildGuidelinePrompt("review", projectSlug, 3000);

    const reported = Array.isArray(alreadyReported)
      ? alreadyReported.filter((x: unknown) => typeof x === "string" && x.trim())
      : [];

    const alreadyReportedSection = reported.length
      ? `\n\nThese problems are ALREADY shown to the writer by the editor. Do not repeat them, restate them, or mention the character counts behind them:\n${reported
          .map((x: string) => `- ${x}`)
          .join("\n")}`
      : "";

    const anthropic = createAnthropic({ apiKey: config.apiKey });
    const { object, usage } = await generateObject({
      model: anthropic(config.defaultModel),
      schema: ReviewSchema,
      system: `${system}\n\n---\n\n${JUDGEMENT_ONLY_INSTRUCTION}${alreadyReportedSection}`,
      prompt: `Review this documentation page against the guidelines above.

Page title: ${title || "(untitled)"}
Category: ${categoryTitle || "(none)"}
Description: ${description || "(none)"}
Meta title: ${metaTitle || "(not set)"}
Meta description: ${metaDescription || "(not set)"}

Content:
${content}`,
      temperature: 0.3,
    });

    // Prefix the ids so a review finding can never collide with a rule finding.
    const findings: Finding[] = object.findings.map((finding, index) => ({
      id: `ai-review-${finding.field}-${index}`,
      severity: "info",
      field: finding.field,
      message: finding.message,
      hint: finding.hint,
    }));

    await logAIUsage({
      userId: session?.user?.id,
      feature: "editorialReview",
      model: config.defaultModel,
      promptTokens: usage?.inputTokens || 0,
      completionTokens: usage?.outputTokens || 0,
      durationMs: Date.now() - startTime,
      success: true,
    });

    return NextResponse.json({ findings });
  } catch (error) {
    console.error("[review-doc] Error:", error);
    const config = await getAIConfig();
    await logAIUsage({
      userId: session?.user?.id,
      feature: "editorialReview",
      model: config.defaultModel,
      promptTokens: 0,
      completionTokens: 0,
      durationMs: Date.now() - startTime,
      success: false,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      { error: "Failed to review document" },
      { status: 500 },
    );
  }
}
