"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Search, Sparkles, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SeoData } from "@/lib/db/ContentManager";
import {
  DEFAULT_GUIDELINES,
  type EditorialGuidelines,
} from "@/lib/editorial/guidelines";
import { countedMetaTitle, type Finding } from "@/lib/editorial/rules";

interface SeoPanelProps {
  seo: SeoData;
  onChange: (seo: SeoData) => void;
  docTitle?: string;
  docDescription?: string;
  contentPreview?: string;
  slug?: string;
  onSlugChange?: (slug: string) => void;
  /** Effective editorial guidelines — drives the character bands. */
  guidelines?: EditorialGuidelines;
  /** Live findings for the meta fields, shown inline under each input. */
  findings?: Finding[];
  /** Passed to the AI routes so per-project overrides apply to generation. */
  projectSlug?: string | null;
}

/**
 * A length counter that shows the band, not just the ceiling (DOCSTUDIO-45 §4).
 *
 * The old counter read "34 / 60" in neutral grey, because only the maximum was
 * known. The minimum is equally part of the guideline and is the one people
 * miss, so an under-length value now reads amber rather than looking fine.
 */
function BandCounter({
  length,
  min,
  max,
  suffixNote,
}: {
  length: number;
  min: number;
  max: number;
  suffixNote?: string;
}) {
  const tooLong = length > max;
  const tooShort = length > 0 && length < min;
  const tone = tooLong || tooShort ? "text-amber-600" : length === 0 ? "text-gray-400" : "text-emerald-600";

  return (
    <p className={`text-xs ${tone}`}>
      {length} / {min}–{max}
      {tooLong
        ? " — too long for Google"
        : tooShort
        ? " — too short"
        : length === 0
        ? " characters"
        : ""}
      {suffixNote && <span className="text-gray-400"> · {suffixNote}</span>}
    </p>
  );
}

/** Inline findings for one field, rendered under its input. */
function FieldFindings({ findings }: { findings: Finding[] }) {
  if (!findings.length) return null;
  return (
    <ul className="space-y-0.5">
      {findings.map((finding) => (
        <li
          key={finding.id}
          className={`text-xs ${
            finding.severity === "warning" ? "text-amber-600" : "text-gray-400"
          }`}
        >
          {finding.message}
        </li>
      ))}
    </ul>
  );
}

export default function SeoPanel({
  seo,
  onChange,
  docTitle,
  docDescription,
  contentPreview,
  slug,
  onSlugChange,
  guidelines = DEFAULT_GUIDELINES,
  findings = [],
  projectSlug,
}: SeoPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [titleGenerating, setTitleGenerating] = useState(false);
  const [titleError, setTitleError] = useState("");
  const [descGenerating, setDescGenerating] = useState(false);
  const [descError, setDescError] = useState("");

  const metaTitle = seo.metaTitle ?? "";
  const metaDescription = seo.metaDescription ?? "";
  const schemaType = seo.schemaType ?? "Article";
  const robots = {
    index: seo.robots?.index ?? true,
    follow: seo.robots?.follow ?? true,
    maxSnippet: seo.robots?.maxSnippet ?? -1,
    maxVideoPreview: seo.robots?.maxVideoPreview ?? -1,
    maxImagePreview: seo.robots?.maxImagePreview ?? "large",
  };
  const sitemap = {
    include: seo.sitemap?.include ?? true,
    priority: seo.sitemap?.priority ?? (slug?.includes("/") ? 0.7 : 0.9),
    changeFrequency: seo.sitemap?.changeFrequency ?? "weekly",
  };

  const effectiveTitle = metaTitle || docTitle || "";
  const effectiveDesc = metaDescription || docDescription || "";

  const canGenerateAI = !!contentPreview;

  const handleGenerateMetaTitle = async () => {
    if (!contentPreview) return;
    setTitleGenerating(true);
    setTitleError("");
    try {
      const res = await fetch("/api/ai/generate-seo-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: contentPreview,
          docTitle,
          currentMetaTitle: metaTitle,
          projectSlug,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate SEO title");
      }
      const data = await res.json();
      onChange({ ...seo, metaTitle: data.metaTitle });
    } catch (err) {
      setTitleError(err instanceof Error ? err.message : "Failed to generate");
    } finally {
      setTitleGenerating(false);
    }
  };

  const handleGenerateMetaDescription = async () => {
    if (!contentPreview) return;
    setDescGenerating(true);
    setDescError("");
    try {
      const res = await fetch("/api/ai/generate-seo-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: contentPreview,
          docTitle,
          currentMetaDescription: metaDescription,
          projectSlug,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate SEO description");
      }
      const data = await res.json();
      onChange({ ...seo, metaDescription: data.metaDescription });
    } catch (err) {
      setDescError(err instanceof Error ? err.message : "Failed to generate");
    } finally {
      setDescGenerating(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors rounded-lg"
      >
        <Search size={15} className="text-gray-400 shrink-0" />
        <span>SEO Settings</span>
        {expanded ? (
          <ChevronDown size={14} className="ml-auto text-gray-400 shrink-0" />
        ) : (
          <ChevronRight size={14} className="ml-auto text-gray-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
          {/* Meta Title */}
          <div className="space-y-1.5 mt-3">
            <Label className="text-xs font-medium text-gray-600">Meta Title</Label>
            <div className="relative group">
              <Input
                value={metaTitle}
                onChange={(e) => {
                  setTitleError("");
                  onChange({ ...seo, metaTitle: e.target.value });
                }}
                placeholder={docTitle || "Leave empty to use document title"}
                className={`text-sm pr-10 ${titleError ? "border-red-300" : ""}`}
              />
              {canGenerateAI && (
                <>
                  <button
                    type="button"
                    onClick={handleGenerateMetaTitle}
                    disabled={titleGenerating}
                    title="Write with AI"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {titleGenerating ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Sparkles size={15} className="text-purple-500" />
                    )}
                  </button>
                  <span className="absolute right-3 -top-7 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                    Write with AI
                  </span>
                </>
              )}
            </div>
            {titleError ? (
              <p className="text-xs text-red-500">{titleError}</p>
            ) : (
              <>
                <BandCounter
                  length={countedMetaTitle(effectiveTitle, guidelines).length}
                  min={guidelines.metaTitle.min}
                  max={guidelines.metaTitle.max}
                  suffixNote={
                    guidelines.metaTitle.suffix
                      ? `includes "${guidelines.metaTitle.suffix.trim()}"`
                      : undefined
                  }
                />
                <FieldFindings
                  findings={findings.filter((f) => f.field === "metaTitle")}
                />
              </>
            )}
          </div>

          {/* Meta Description */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">Meta Description</Label>
            <div className="relative group">
              <textarea
                value={metaDescription}
                onChange={(e) => {
                  setDescError("");
                  onChange({ ...seo, metaDescription: e.target.value });
                }}
                placeholder={docDescription || "Leave empty to use document description"}
                rows={3}
                className={`w-full text-sm rounded-md border bg-background px-3 py-2 pr-10 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none ${
                  descError ? "border-red-300" : "border-input"
                }`}
              />
              {canGenerateAI && (
                <>
                  <button
                    type="button"
                    onClick={handleGenerateMetaDescription}
                    disabled={descGenerating}
                    title="Write with AI"
                    className="absolute right-3 top-3 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {descGenerating ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Sparkles size={15} className="text-purple-500" />
                    )}
                  </button>
                  <span className="absolute right-3 -top-7 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                    Write with AI
                  </span>
                </>
              )}
            </div>
            {descError ? (
              <p className="text-xs text-red-500">{descError}</p>
            ) : (
              <>
                <BandCounter
                  length={effectiveDesc.length}
                  min={guidelines.metaDescription.min}
                  max={guidelines.metaDescription.max}
                />
                <FieldFindings
                  findings={findings.filter((f) => f.field === "metaDescription")}
                />
              </>
            )}
          </div>

          {/* Canonical URL */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">Canonical URL Override</Label>
            <Input
              value={seo.canonicalUrl ?? ""}
              onChange={(e) => onChange({ ...seo, canonicalUrl: e.target.value })}
              placeholder="Leave empty to use this document URL"
              className="text-sm"
            />
            <p className="text-xs text-gray-400">
              Use only when this page should consolidate ranking signals to another URL
            </p>
          </div>

          {/* Robots */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-gray-600">Robots</Label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2">
                <span className="text-sm text-gray-700">Index</span>
                <Switch
                  checked={robots.index}
                  onCheckedChange={(checked) =>
                    onChange({ ...seo, robots: { ...robots, index: checked } })
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2">
                <span className="text-sm text-gray-700">Follow</span>
                <Switch
                  checked={robots.follow}
                  onCheckedChange={(checked) =>
                    onChange({ ...seo, robots: { ...robots, follow: checked } })
                  }
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Max Snippet</Label>
                <Input
                  type="number"
                  value={robots.maxSnippet}
                  onChange={(e) =>
                    onChange({
                      ...seo,
                      robots: { ...robots, maxSnippet: Number(e.target.value) },
                    })
                  }
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Image Preview</Label>
                <Select
                  value={robots.maxImagePreview}
                  onValueChange={(val) =>
                    onChange({
                      ...seo,
                      robots: {
                        ...robots,
                        maxImagePreview: val as NonNullable<
                          SeoData["robots"]
                        >["maxImagePreview"],
                      },
                    })
                  }
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="large">Large</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Default: index, follow, max-snippet:-1, max-video-preview:-1, max-image-preview:large
            </p>
          </div>

          {/* Slug */}
          {slug !== undefined && onSlugChange && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Slug</Label>
              <div className="flex items-center border border-input rounded-md overflow-hidden bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                {slug.includes("/") && (
                  <span className="pl-3 text-sm text-gray-400 shrink-0 select-none">
                    {slug.split("/")[0]}/
                  </span>
                )}
                <input
                  type="text"
                  value={slug.includes("/") ? slug.split("/").slice(1).join("/") : slug}
                  onChange={(e) => {
                    const sectionPart = slug.includes("/") ? slug.split("/")[0] : "";
                    onSlugChange(sectionPart ? `${sectionPart}/${e.target.value}` : e.target.value);
                  }}
                  onBlur={(e) => {
                    const sectionPart = slug.includes("/") ? slug.split("/")[0] : "";
                    const sanitized = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
                    onSlugChange(sectionPart ? `${sectionPart}/${sanitized}` : sanitized);
                  }}
                  className="flex-1 px-3 py-2 text-sm outline-none bg-transparent"
                  placeholder="document-slug"
                />
              </div>
              <p className="text-xs text-gray-400">URL-safe identifier for this document</p>
            </div>
          )}

          {/* Schema Type */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">Schema Type (JSON-LD)</Label>
            <Select
              value={schemaType}
              onValueChange={(val) =>
                onChange({ ...seo, schemaType: val as SeoData["schemaType"] })
              }
            >
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Article">Article</SelectItem>
                <SelectItem value="TechArticle">TechArticle</SelectItem>
                <SelectItem value="HowTo">HowTo</SelectItem>
                <SelectItem value="FAQPage">FAQPage</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-400">
              Controls structured data type for rich results in Google Search
            </p>
          </div>

          {/* Social Sharing */}
          <div className="space-y-3">
            <Label className="text-xs font-medium text-gray-600">Social Sharing</Label>
            <Input
              value={seo.ogTitle ?? ""}
              onChange={(e) => onChange({ ...seo, ogTitle: e.target.value })}
              placeholder="Open Graph title, defaults to meta title"
              className="text-sm"
            />
            <Input
              value={seo.ogDescription ?? ""}
              onChange={(e) => onChange({ ...seo, ogDescription: e.target.value })}
              placeholder="Open Graph description, defaults to meta description"
              className="text-sm"
            />
            <Input
              value={seo.ogImage ?? ""}
              onChange={(e) => onChange({ ...seo, ogImage: e.target.value })}
              placeholder="https://example.com/og-image.jpg"
              className="text-sm"
            />
            <Input
              value={seo.ogImageAlt ?? ""}
              onChange={(e) => onChange({ ...seo, ogImageAlt: e.target.value })}
              placeholder="Image alt text, defaults to page title"
              className="text-sm"
            />
          </div>

          {/* Sitemap */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-gray-600">Sitemap</Label>
            <label className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2">
              <span className="text-sm text-gray-700">Include in sitemap</span>
              <Switch
                checked={sitemap.include}
                onCheckedChange={(checked) =>
                  onChange({ ...seo, sitemap: { ...sitemap, include: checked } })
                }
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Priority</Label>
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={sitemap.priority}
                  onChange={(e) =>
                    onChange({
                      ...seo,
                      sitemap: { ...sitemap, priority: Number(e.target.value) },
                    })
                  }
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Change Frequency</Label>
                <Select
                  value={sitemap.changeFrequency}
                  onValueChange={(val) =>
                    onChange({
                      ...seo,
                      sitemap: {
                        ...sitemap,
                        changeFrequency: val as NonNullable<SeoData["sitemap"]>["changeFrequency"],
                      },
                    })
                  }
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                    <SelectItem value="never">Never</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Focus Keyword */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">Focus Keyword</Label>
            <Input
              value={seo.focusKeyword ?? ""}
              onChange={(e) => onChange({ ...seo, focusKeyword: e.target.value })}
              placeholder="Primary query this page should target"
              className="text-sm"
            />
          </div>

          {/* Google Preview */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">Google Preview</Label>
            <div className="border border-gray-200 rounded-md p-3 bg-gray-50 space-y-0.5">
              {/* Must include the site-name suffix: it is appended at render,
                  so a preview without it shows a shorter title than Google
                  will — which is precisely what a preview exists to prevent. */}
              <p className="text-sm text-blue-700 font-medium truncate">
                {effectiveTitle
                  ? countedMetaTitle(effectiveTitle, guidelines)
                  : "Page title"}
              </p>
              <p className="text-xs text-green-700 truncate">yoursite.com › docs › ...</p>
              <p className="text-xs text-gray-600 mt-0.5 line-clamp-2 leading-relaxed">
                {effectiveDesc || "Page description will appear here..."}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
