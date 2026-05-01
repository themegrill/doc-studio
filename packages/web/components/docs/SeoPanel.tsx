"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Search, Sparkles, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SeoData } from "@/lib/db/ContentManager";

interface SeoPanelProps {
  seo: SeoData;
  onChange: (seo: SeoData) => void;
  docTitle?: string;
  docDescription?: string;
  contentPreview?: string;
}

export default function SeoPanel({
  seo,
  onChange,
  docTitle,
  docDescription,
  contentPreview,
}: SeoPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [titleGenerating, setTitleGenerating] = useState(false);
  const [titleError, setTitleError] = useState("");
  const [descGenerating, setDescGenerating] = useState(false);
  const [descError, setDescError] = useState("");

  const metaTitle = seo.metaTitle ?? "";
  const metaDescription = seo.metaDescription ?? "";
  const schemaType = seo.schemaType ?? "Article";

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
              <p
                className={`text-xs ${
                  effectiveTitle.length > 60 ? "text-amber-600" : "text-gray-400"
                }`}
              >
                {effectiveTitle.length} / 60{" "}
                {effectiveTitle.length > 60 ? "— too long for Google" : "characters"}
              </p>
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
              <p
                className={`text-xs ${
                  effectiveDesc.length > 160 ? "text-amber-600" : "text-gray-400"
                }`}
              >
                {effectiveDesc.length} / 160{" "}
                {effectiveDesc.length > 160 ? "— too long for Google" : "characters"}
              </p>
            )}
          </div>

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

          {/* Google Preview */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">Google Preview</Label>
            <div className="border border-gray-200 rounded-md p-3 bg-gray-50 space-y-0.5">
              <p className="text-sm text-blue-700 font-medium truncate">
                {effectiveTitle || "Page title"}
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
