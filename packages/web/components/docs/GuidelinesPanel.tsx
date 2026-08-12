"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  Info,
  Sparkles,
  Loader2,
  Check,
} from "lucide-react";
import { useAIFeatures } from "@/hooks/use-ai-features";
import { FINDING_FIELD_LABEL, type Finding } from "@/lib/editorial/rules";

/** Fields whose suggestion maps to an editable text input. */
const APPLYABLE_FIELDS: Finding["field"][] = [
  "title",
  "metaTitle",
  "metaDescription",
];

/**
 * The pre-publish checklist, live (DOCSTUDIO-45 §4).
 *
 * The style guide already ended with a checklist; this renders it in the editor,
 * ticked off as the writer works, instead of leaving it in Jira to be recalled.
 * Everything here is advisory — nothing in this panel blocks a save or publish.
 */

interface GuidelinesPanelProps {
  findings: Finding[];
  /** Content excerpt for the AI review; the button hides when absent. */
  contentPreview?: string;
  title?: string;
  description?: string;
  metaTitle?: string;
  metaDescription?: string;
  categoryTitle?: string;
  projectSlug?: string | null;
  onReviewFindings?: (findings: Finding[]) => void;
  /** Applies a suggested rewrite to the field it belongs to. */
  onApplySuggestion?: (field: Finding["field"], value: string) => void;
}

export default function GuidelinesPanel({
  findings,
  contentPreview,
  title,
  description,
  metaTitle,
  metaDescription,
  categoryTitle,
  projectSlug,
  onReviewFindings,
  onApplySuggestion,
}: GuidelinesPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const { isEnabled } = useAIFeatures();

  const warnings = findings.filter((f) => f.severity === "warning");
  const notes = findings.filter((f) => f.severity === "info");
  const isClean = findings.length === 0;

  const canReview = !!contentPreview && isEnabled("editorialReview");

  const handleReview = async () => {
    if (!contentPreview) return;
    setReviewing(true);
    setReviewError("");
    try {
      const res = await fetch("/api/ai/review-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: contentPreview,
          title,
          description,
          metaTitle,
          metaDescription,
          categoryTitle,
          projectSlug,
          // Telling the model the rules are "checked automatically" was not
          // enough — it still restated the character counts sitting directly
          // above it. Sending the actual findings is precise where the
          // instruction was merely hopeful.
          alreadyReported: findings
            .filter((f) => f.severity === "warning")
            .map((f) => `${FINDING_FIELD_LABEL[f.field]}: ${f.message}`),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to run editorial review");
      }
      const data = await res.json();
      onReviewFindings?.(data.findings ?? []);
      setReviewed(true);
    } catch (err) {
      setReviewError(
        err instanceof Error ? err.message : "Failed to run editorial review",
      );
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors rounded-lg"
      >
        <ClipboardCheck size={15} className="text-gray-400 shrink-0" />
        <span>Guidelines</span>

        {/* "All clear" must mean the list below is empty. Counting only
            warnings meant a page with four AI suggestions still claimed to be
            clear while listing all four directly underneath. */}
        {warnings.length > 0 ? (
          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
            {warnings.length}
          </span>
        ) : notes.length > 0 ? (
          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 border border-gray-200">
            {notes.length} {notes.length === 1 ? "suggestion" : "suggestions"}
          </span>
        ) : (
          <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
            <CheckCircle2 size={13} />
            All clear
          </span>
        )}

        {expanded ? (
          <ChevronDown size={14} className="ml-auto text-gray-400 shrink-0" />
        ) : (
          <ChevronRight size={14} className="ml-auto text-gray-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-3 space-y-3 border-t border-gray-100">
          {isClean ? (
            <div className="flex items-start gap-2.5 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2.5">
              <CheckCircle2
                size={15}
                className="text-emerald-600 shrink-0 mt-0.5"
              />
              <p className="text-sm text-emerald-800">
                This page meets the editorial guidelines.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {[...warnings, ...notes].map((finding) => {
                const isWarning = finding.severity === "warning";
                return (
                  <li
                    key={finding.id}
                    className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 ${
                      isWarning
                        ? "border-amber-100 bg-amber-50"
                        : "border-gray-100 bg-gray-50"
                    }`}
                  >
                    {isWarning ? (
                      <AlertTriangle
                        size={15}
                        className="text-amber-600 shrink-0 mt-0.5"
                      />
                    ) : (
                      <Info size={15} className="text-gray-400 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <p
                        className={`text-sm ${
                          isWarning ? "text-amber-900" : "text-gray-700"
                        }`}
                      >
                        <span className="font-medium">
                          {FINDING_FIELD_LABEL[finding.field]}
                        </span>{" "}
                        — {finding.message}
                      </p>
                      {finding.hint && (
                        <p
                          className={`text-xs mt-0.5 ${
                            isWarning ? "text-amber-700" : "text-gray-500"
                          }`}
                        >
                          {finding.hint}
                        </p>
                      )}

                      {finding.suggestion && (
                        <div className="mt-1.5 flex items-start gap-2 rounded border border-gray-200 bg-white px-2 py-1.5">
                          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-gray-400 mt-0.5">
                            Suggested
                          </span>
                          <p className="min-w-0 flex-1 text-xs text-gray-700">
                            {finding.suggestion}
                          </p>
                          {onApplySuggestion &&
                            APPLYABLE_FIELDS.includes(finding.field) && (
                              <button
                                type="button"
                                onClick={() =>
                                  onApplySuggestion(
                                    finding.field,
                                    finding.suggestion as string,
                                  )
                                }
                                className="shrink-0 inline-flex items-center gap-1 rounded border border-gray-200 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
                              >
                                <Check size={11} />
                                Use
                              </button>
                            )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {canReview && (
            <div className="pt-1">
              <button
                type="button"
                onClick={handleReview}
                disabled={reviewing}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reviewing ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Sparkles size={13} className="text-purple-500" />
                )}
                {reviewing
                  ? "Reviewing…"
                  : reviewed
                  ? "Run editorial review again"
                  : "Run editorial review"}
              </button>
              <p className="text-xs text-gray-400 mt-1">
                Checks what a character count cannot — whether the title is
                task-oriented and the category matches user intent.
              </p>
              {reviewError && (
                <p className="text-xs text-red-500 mt-1">{reviewError}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
