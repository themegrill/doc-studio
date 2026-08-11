"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Save, ClipboardCheck, ListPlus } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_GUIDELINES,
  type EditorialGuidelines,
} from "@/lib/editorial/guidelines";

/**
 * Documentation Guidelines settings (DOCSTUDIO-45 §6).
 *
 * Everything the editor checks and everything the AI is told comes from these
 * values, so the SEO and Documentation teams can change a rule here without an
 * engineering ticket or a deployment.
 *
 * Fields marked "awaiting sign-off" are the ones where the written guideline
 * states a principle but no checkable number — see the ticket's open questions.
 */

const listToText = (items: string[]) => items.join("\n");
const textToList = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 border-t border-gray-100 pt-6 first:border-0 first:pt-0">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function EditorialGuidelinesSettings({
  /** Omit for the org-wide defaults; pass a slug to edit a project override. */
  projectSlug,
}: {
  projectSlug?: string;
} = {}) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [guidelines, setGuidelines] =
    useState<EditorialGuidelines>(DEFAULT_GUIDELINES);
  const [categoriesText, setCategoriesText] = useState("");
  const [loadingSections, setLoadingSections] = useState(false);

  const endpoint = projectSlug
    ? `/api/projects/${projectSlug}/editorial`
    : "/api/settings/editorial";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        if (cancelled || !data.guidelines) return;
        setGuidelines(data.guidelines);
        setCategoriesText(listToText(data.guidelines.categories.allowed));
      } catch {
        if (!cancelled) {
          toast({
            title: "Could not load guidelines",
            description: "Showing the built-in defaults instead.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint, toast]);

  const patch = <K extends keyof EditorialGuidelines>(
    key: K,
    value: Partial<EditorialGuidelines[K]>,
  ) =>
    setGuidelines((prev) => ({
      ...prev,
      [key]:
        typeof prev[key] === "object" && !Array.isArray(prev[key])
          ? { ...prev[key], ...value }
          : value,
    }));

  /** Fill the textarea from the project's live sections, as a starting point. */
  const handleUseCurrentSections = async () => {
    if (!projectSlug) return;
    setLoadingSections(true);
    try {
      const res = await fetch(`/api/projects/${projectSlug}/sections`);
      if (!res.ok) throw new Error("Failed to load sections");
      const data = await res.json();
      const titles = (data.sections ?? [])
        .map((section: { title?: string }) => (section?.title ?? "").trim())
        .filter(Boolean);

      if (!titles.length) {
        toast({
          title: "No sections yet",
          description: "This project has no sections to copy from.",
        });
        return;
      }

      setCategoriesText(titles.join("\n"));
      toast({
        title: `Filled in ${titles.length} categor${titles.length === 1 ? "y" : "ies"}`,
        description: "Edit the list as needed, then save.",
      });
    } catch {
      toast({
        title: "Could not load sections",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingSections(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload: EditorialGuidelines = {
        ...guidelines,
        categories: {
          ...guidelines.categories,
          allowed: textToList(categoriesText),
        },
      };

      const res = await fetch(endpoint, {
        method: projectSlug ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          projectSlug ? { override: payload } : { guidelines: payload },
        ),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }

      const data = await res.json();
      setGuidelines(data.guidelines);
      toast({
        title: "Guidelines saved",
        description: projectSlug
          ? "This project now overrides the org-wide defaults."
          : "The editor hints and the AI prompts both use these values.",
      });
    } catch (error) {
      toast({
        title: "Could not save guidelines",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to reset");
      const data = await res.json();
      setGuidelines(data.guidelines);
      setCategoriesText(listToText(data.guidelines.categories.allowed));
      toast({
        title: projectSlug ? "Override cleared" : "Reset to defaults",
        description: projectSlug
          ? "This project now inherits the org-wide guidelines."
          : "The built-in guideline values are back in effect.",
      });
    } catch {
      toast({
        title: "Could not reset",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-10 text-sm text-gray-500">
          <Loader2 size={15} className="animate-spin" />
          Loading guidelines…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck size={18} className="text-gray-400" />
          Documentation Guidelines
        </CardTitle>
        <CardDescription>
          {projectSlug
            ? "Override the org-wide guidelines for this project. Leave a field at its inherited value to keep following the default."
            : "The editorial rules the editor checks while writing and the AI follows when generating. Changing a value here updates both."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <Section
          title="Post titles"
          description="Short, task-oriented titles — “Generate Purchase Invoice”, not “How to Generate the Invoice for Your Purchase”."
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Maximum words" hint="Awaiting Documentation sign-off">
              <Input
                type="number"
                min={1}
                value={guidelines.title.maxWords}
                onChange={(e) =>
                  patch("title", { maxWords: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Maximum characters" hint="Awaiting Documentation sign-off">
              <Input
                type="number"
                min={1}
                value={guidelines.title.maxChars}
                onChange={(e) =>
                  patch("title", { maxChars: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          <Field
            label="Banned opening phrases"
            hint="Comma separated. Titles starting with any of these are flagged."
          >
            <Input
              value={guidelines.title.bannedPrefixes.join(", ")}
              onChange={(e) =>
                patch("title", {
                  bannedPrefixes: e.target.value
                    .split(",")
                    .map((s) => s.trim().toLowerCase())
                    .filter(Boolean),
                })
              }
            />
          </Field>
        </Section>

        <Section
          title="Categories"
          description="Group articles by what the user is trying to achieve, not by add-on name."
        >
          <Field
            label="Approved categories"
            hint={
              projectSlug
                ? "One per line. Leave empty to use this project's existing sections as its approved categories — only fill this in when Marketing hands over a canonical list."
                : "One per line. Normally left empty: each project uses its own existing sections. Only set an org-wide list if every product genuinely shares one taxonomy."
            }
          >
            <textarea
              value={categoriesText}
              onChange={(e) => setCategoriesText(e.target.value)}
              rows={5}
              placeholder={
                projectSlug
                  ? "Empty — using this project's existing sections"
                  : "Empty — each project uses its own sections"
              }
              className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>

          {projectSlug && (
            <button
              type="button"
              onClick={handleUseCurrentSections}
              disabled={loadingSections}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingSections ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <ListPlus size={13} />
              )}
              Use current sections
            </button>
          )}
          <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
            <span className="text-sm text-gray-700">
              Warn when a new category is created
            </span>
            <Switch
              checked={guidelines.categories.warnOnNew}
              onCheckedChange={(checked) =>
                patch("categories", { warnOnNew: checked })
              }
            />
          </div>
        </Section>

        <Section
          title="Screenshots"
          description="Checked on upload. Non-compliant images are refused rather than converted, so the author composes them deliberately."
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Width (px)">
              <Input
                type="number"
                min={1}
                value={guidelines.images.width}
                onChange={(e) =>
                  patch("images", { width: Number(e.target.value) })
                }
              />
            </Field>
            <Field
              label="Width rule"
              hint="Awaiting Documentation sign-off — “exactly” rejects cropped screenshots."
            >
              <Select
                value={guidelines.images.widthMode}
                onValueChange={(value) =>
                  patch("images", { widthMode: value as "exact" | "max" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exact">Exactly this width</SelectItem>
                  <SelectItem value="max">At most this width</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Preferred size (KB)">
              <Input
                type="number"
                min={1}
                value={guidelines.images.targetKb}
                onChange={(e) =>
                  patch("images", { targetKb: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Maximum size (KB)">
              <Input
                type="number"
                min={1}
                value={guidelines.images.maxKb}
                onChange={(e) =>
                  patch("images", { maxKb: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          <Field
            label="Annotation style guide URL"
            hint="Linked from the image toolbar. Annotation consistency is human judgement, not a check."
          >
            <Input
              value={guidelines.images.annotationStyleGuideUrl}
              onChange={(e) =>
                patch("images", { annotationStyleGuideUrl: e.target.value })
              }
              placeholder="https://…"
            />
          </Field>
          <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
            <span className="text-sm text-gray-700">Require alt text</span>
            <Switch
              checked={guidelines.images.requireAlt}
              onCheckedChange={(checked) =>
                patch("images", { requireAlt: checked })
              }
            />
          </div>
        </Section>

        <Section
          title="Meta title"
          description="Shown as the headline in search results."
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Minimum characters">
              <Input
                type="number"
                min={0}
                value={guidelines.metaTitle.min}
                onChange={(e) =>
                  patch("metaTitle", { min: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Maximum characters">
              <Input
                type="number"
                min={1}
                value={guidelines.metaTitle.max}
                onChange={(e) =>
                  patch("metaTitle", { max: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          {/* Whether the suffix counts toward the band is an org-wide SEO
              ruling (open question 3), not something each product answers
              differently — so it stays global even though the suffix itself
              does not. */}
          {!projectSlug && (
            <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
              <div>
                <span className="text-sm text-gray-700">
                  Count the site-name suffix toward the character limit
                </span>
                <p className="text-xs text-gray-500">
                  Awaiting SEO sign-off. Off means the band applies to the
                  writer&apos;s text alone, before the suffix is appended.
                </p>
              </div>
              <Switch
                checked={guidelines.metaTitle.suffixCountsTowardLimit}
                onCheckedChange={(checked) =>
                  patch("metaTitle", { suffixCountsTowardLimit: checked })
                }
              />
            </div>
          )}

          {/* Project-only: the site name is product-specific, so an org-wide
              value would be wrong for every project but one — the same mistake
              the seeded category list made. */}
          {projectSlug ? (
            <>
              <Field
                label="Site-name suffix"
                hint="Appended to every page title on the public docs site, e.g. “ – URM Docs”. Leave empty to append nothing."
              >
                <Input
                  value={guidelines.metaTitle.suffix}
                  onChange={(e) => patch("metaTitle", { suffix: e.target.value })}
                  placeholder=" – URM Docs"
                />
              </Field>
            </>
          ) : (
            <p className="text-xs text-gray-500">
              The site-name suffix is set per project, under that project&apos;s
              Guidelines tab — it is the product&apos;s own name.
            </p>
          )}
          <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
            <span className="text-sm text-gray-700">Warn on duplicates</span>
            <Switch
              checked={guidelines.metaTitle.warnOnDuplicate}
              onCheckedChange={(checked) =>
                patch("metaTitle", { warnOnDuplicate: checked })
              }
            />
          </div>
        </Section>

        <Section
          title="Meta description"
          description="Shown as the snippet under the headline in search results."
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Minimum characters">
              <Input
                type="number"
                min={0}
                value={guidelines.metaDescription.min}
                onChange={(e) =>
                  patch("metaDescription", { min: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Maximum characters">
              <Input
                type="number"
                min={1}
                value={guidelines.metaDescription.max}
                onChange={(e) =>
                  patch("metaDescription", { max: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          {/* Project-only for the same reason as the site-name suffix: the
              product's own name is wrong for every other product. */}
          {projectSlug ? (
            <Field
              label="Product name to mention once"
              hint="e.g. URM — this product's name. Leave empty to disable the check."
            >
              <Input
                value={guidelines.metaDescription.brandMention}
                onChange={(e) =>
                  patch("metaDescription", { brandMention: e.target.value })
                }
              />
            </Field>
          ) : (
            <p className="text-xs text-gray-500">
              The product name to mention is set per project, under that
              project&apos;s Guidelines tab.
            </p>
          )}
          <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
            <span className="text-sm text-gray-700">Warn on duplicates</span>
            <Switch
              checked={guidelines.metaDescription.warnOnDuplicate}
              onCheckedChange={(checked) =>
                patch("metaDescription", { warnOnDuplicate: checked })
              }
            />
          </div>
          <Field
            label="Uniqueness scope"
            hint="Awaiting SEO sign-off — whether meta must be unique within one product or across all of them."
          >
            <Select
              value={guidelines.duplicateScope}
              onValueChange={(value) =>
                setGuidelines((prev) => ({
                  ...prev,
                  duplicateScope: value as "project" | "global",
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">Within this product</SelectItem>
                <SelectItem value="global">Across every product</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </Section>

        <div className="flex items-center gap-2 border-t border-gray-100 pt-5">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
            Save guidelines
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={isSaving}>
            <RotateCcw size={15} />
            {projectSlug ? "Clear override" : "Reset to defaults"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
