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
  /**
   * Only where it states something the label cannot — what the setting
   * controls, or how the system behaves. Restating the editorial guideline is
   * noise here: admins see this screen, writers get the rules in the editor.
   */
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 border-t border-gray-100 pt-6 first:border-0 first:pt-0">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {description && <p className="text-xs text-gray-500">{description}</p>}
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
          // The global screen no longer edits this list, so it writes an empty
          // one rather than preserving a value nobody can see. That also clears
          // any org-wide list saved before the field moved to project scope.
          allowed: projectSlug ? textToList(categoriesText) : [],
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
        {projectSlug && (
          <CardDescription>
            Override the org-wide guidelines for this project. Leave a field at
            its inherited value to keep following the default.
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        <Section
          title="Post titles"
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Maximum words">
              <Input
                type="number"
                min={1}
                value={guidelines.title.maxWords}
                onChange={(e) =>
                  patch("title", { maxWords: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Maximum characters">
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
        >
          {/* Project-only. An org-wide list is the trap this feature already fell
              into once: four URM categories seeded globally meant every other
              product inherited a taxonomy that had nothing to do with it. Left
              empty — the correct state — a project uses its own live sections,
              which is always more current than anything typed here. */}
          {projectSlug ? (
            <Field
              label="Approved categories"
              hint="One per line. Leave empty to use this project's existing sections — only fill this in when Marketing hands over a fixed list."
            >
              <textarea
                value={categoriesText}
                onChange={(e) => setCategoriesText(e.target.value)}
                rows={5}
                placeholder="Empty — using this project's existing sections"
                className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </Field>
          ) : null}

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
          title="Images"
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
              hint="“Exactly” means every image must be placed on a 1150px canvas first."
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

          {/* Project-only: the site name is product-specific, so an org-wide
              value would be wrong for every project but one — the same mistake
              the seeded category list made. */}
          {projectSlug ? (
            <>
              <Field
                label="Site-name suffix"
                hint="Appended to every page title on the public docs site, e.g. “ – URM Docs”. It counts toward the character band above. Leave empty to append nothing."
              >
                <Input
                  value={guidelines.metaTitle.suffix}
                  onChange={(e) => patch("metaTitle", { suffix: e.target.value })}
                  placeholder=" – URM Docs"
                />
              </Field>
            </>
          ) : null}
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
          ) : null}
        </Section>

        {/* Global only. Scope describes a relationship *between* projects, so it
            cannot vary by project without contradicting itself: if one project
            looks across all products and another looks only at itself, the same
            pair of documents is a duplicate from one side and not from the
            other. Enforced server-side too — see setProjectOverride. */}
        {!projectSlug && (
        <Section
          title="Uniqueness"
          description="Applies to both the meta title and the meta description."
        >
          <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
            <span className="text-sm text-gray-700">
              Warn when another article already uses the same text
            </span>
            <Switch
              checked={guidelines.duplicates.warn}
              onCheckedChange={(checked) =>
                patch("duplicates", { warn: checked })
              }
            />
          </div>
        </Section>
        )}

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
