"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Globe, RefreshCw, CheckCircle2, XCircle, GitBranch, AlertCircle, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface KnowledgeBaseSettingsProps {
  projectSlug: string;
  projectName: string;
  projectMetadata: Record<string, any>;
  isSuperAdmin: boolean;
  githubConfigured: boolean;
}

interface CrawlProgress {
  status: "idle" | "crawling" | "refining" | "done" | "error";
  visitedPages?: number;
  maxPages?: number;
  currentBatch?: number;
  totalBatches?: number;
  progress: number;
  message: string;
  error?: string | null;
  completedAt?: string | null;
}

export function KnowledgeBaseSettings({
  projectSlug,
  projectName,
  projectMetadata,
  isSuperAdmin,
  githubConfigured,
}: KnowledgeBaseSettingsProps) {
  const router = useRouter();
  const { toast } = useToast();

  // ── Website (crawl) state ──────────────────────────────────────────────────
  const [websiteUrl, setWebsiteUrl] = useState(
    projectMetadata?.siteLink || ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── GitHub (codebase) state ────────────────────────────────────────────────
  // Default file path: plugins/{projectSlug}/knowledge_base.json
  const [githubFilePath, setGithubFilePath] = useState(
    projectMetadata?.githubKbFilePath || `plugins/${projectSlug}/knowledge_base.json`
  );
  const [isFetchingGithub, setIsFetchingGithub] = useState(false);

  // ── Crawl polling helpers ──────────────────────────────────────────────────
  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    fetch(`/api/projects/${projectSlug}/knowledge-base/progress`)
      .then((res) => res.ok ? res.json() : null)
      .then((data: CrawlProgress | null) => {
        if (!data) return;
        setCrawlProgress(data);
        if (data.status === "crawling" || data.status === "refining") {
          setIsFetching(true);
          startPolling();
        }
      })
      .catch(() => {});

    return () => stopPolling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectSlug]);

  const startPolling = () => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectSlug}/knowledge-base/progress`);
        if (!res.ok) return;
        const data: CrawlProgress = await res.json();
        setCrawlProgress(data);

        if (data.status === "done" || data.status === "error") {
          stopPolling();
          setIsFetching(false);
          if (data.status === "done") {
            let saveOk = false;
            try {
              const saveRes = await fetch(`/api/projects/${projectSlug}/knowledge-base/save`, {
                method: "POST",
              });
              saveOk = saveRes.ok;
              if (!saveRes.ok) {
                const saveErr = await saveRes.json().catch(() => ({}));
                console.error("[KB] Failed to save knowledge base to database:", saveErr);
                toast({
                  title: "Save Failed",
                  description: saveErr?.error || "Crawl completed but failed to save to database. Please try again.",
                  variant: "destructive",
                });
              }
            } catch (saveErr) {
              console.error("[KB] Error saving knowledge base to database:", saveErr);
              toast({
                title: "Save Failed",
                description: "Crawl completed but failed to save to database. Please try again.",
                variant: "destructive",
              });
            }
            if (saveOk) {
              toast({ title: "Done", description: "Website knowledge base is ready." });
            }
            router.refresh();
          } else {
            toast({ title: "Error", description: data.error || "Crawl failed.", variant: "destructive" });
          }
        }
      } catch {
        // ignore transient poll errors
      }
    }, 2000);
  };

  const isValidUrl = (value: string) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  };

  // ── Website handlers ───────────────────────────────────────────────────────
  const handleSaveWebsiteUrl = async () => {
    if (!websiteUrl.trim()) {
      toast({ title: "Error", description: "Website URL is required", variant: "destructive" });
      return;
    }
    if (!isValidUrl(websiteUrl)) {
      toast({ title: "Error", description: "Please enter a valid website URL", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const updatedMetadata = { ...projectMetadata, siteLink: websiteUrl };
      const response = await fetch(`/api/projects/${projectSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName, slug: projectSlug, metadata: updatedMetadata }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save website URL");
      }

      toast({ title: "Success", description: "Knowledge base website URL saved successfully" });
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save website URL",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFetchKnowledgeBase = async () => {
    if (!websiteUrl.trim()) {
      toast({ title: "Error", description: "Please enter a website URL first", variant: "destructive" });
      return;
    }
    if (!isValidUrl(websiteUrl)) {
      toast({ title: "Error", description: "Please enter a valid website URL", variant: "destructive" });
      return;
    }

    setIsFetching(true);
    setCrawlProgress({ status: "crawling", progress: 0, message: "Starting crawl..." });

    try {
      const response = await fetch(`/api/projects/${projectSlug}/knowledge-base/fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch knowledge base");
      }

      toast({ title: "Started", description: "Crawling website in the background..." });
      startPolling();
    } catch (error) {
      setIsFetching(false);
      setCrawlProgress(null);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch knowledge base",
        variant: "destructive",
      });
    }
  };

  const handleCancelCrawl = async () => {
    try {
      await fetch(`/api/projects/${projectSlug}/knowledge-base/cancel`, { method: "POST" });
    } catch { /* ignore */ }
    stopPolling();
    setIsFetching(false);
    setCrawlProgress((prev) => prev ? { ...prev, status: "error", message: "Crawl cancelled by user.", progress: prev.progress } : null);
  };

  // ── GitHub handler ─────────────────────────────────────────────────────────
  const handleFetchCodebaseKB = async () => {
    setIsFetchingGithub(true);
    try {
      const response = await fetch(
        `/api/projects/${projectSlug}/knowledge-base/fetch-codebase`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filePath: githubFilePath.trim() || undefined,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch codebase knowledge base");
      }

      const result = await response.json();
      toast({
        title: "Success",
        description: `Codebase knowledge base fetched from ${result.repo} (${result.filePath})`,
      });
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch codebase knowledge base",
        variant: "destructive",
      });
    } finally {
      setIsFetchingGithub(false);
    }
  };

  const showProgress = isFetching || (crawlProgress && crawlProgress.status !== "idle");

  return (
    <div className="space-y-6">
      {/* ── Website Knowledge Base ─────────────────────────────────────────── */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Website Knowledge Base</h3>
        <p className="text-sm text-gray-500 mb-4">
          Crawl a website to build a knowledge base for this project.
        </p>

        <div className="space-y-4">
          <div>
            <Label htmlFor="website-url">Website URL</Label>
            <p className="text-xs text-gray-500 mt-1 mb-2">
              Enter the website URL you want to crawl as a source for the knowledge base.
            </p>
            <Input
              id="website-url"
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              className="mt-1"
              disabled={!isSuperAdmin || isSaving || isFetching}
            />
          </div>

          {isSuperAdmin && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={handleSaveWebsiteUrl} disabled={isSaving || isFetching}>
                {isSaving ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" />Save Website URL</>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={handleFetchKnowledgeBase}
                disabled={isFetching || isSaving}
              >
                {isFetching ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Fetching...</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-2" />Fetch Knowledge Base</>
                )}
              </Button>

              {isFetching && (
                <Button variant="destructive" onClick={handleCancelCrawl}>
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              )}
            </div>
          )}

          {showProgress && crawlProgress && (
            <div className="mt-4 p-4 bg-gray-50 rounded-md space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                {crawlProgress.status === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                ) : crawlProgress.status === "error" ? (
                  <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
                )}
                <span>{crawlProgress.message}</span>
              </div>

              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    crawlProgress.status === "error"
                      ? "bg-red-500"
                      : crawlProgress.status === "done"
                      ? "bg-green-500"
                      : "bg-blue-500"
                  }`}
                  style={{ width: `${crawlProgress.progress}%` }}
                />
              </div>

              <div className="flex justify-between text-xs text-gray-500">
                <span>
                  {crawlProgress.status === "crawling" && crawlProgress.visitedPages !== undefined
                    ? `${crawlProgress.visitedPages} pages crawled`
                    : crawlProgress.status === "refining" && crawlProgress.currentBatch !== undefined
                    ? `Batch ${crawlProgress.currentBatch}/${crawlProgress.totalBatches}`
                    : crawlProgress.status === "done"
                    ? "Complete"
                    : crawlProgress.status === "error"
                    ? "Failed"
                    : "Initializing..."}
                </span>
                <span>{crawlProgress.progress}%</span>
              </div>
            </div>
          )}

          {websiteUrl && (
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md text-sm text-gray-700">
              <Globe className="h-4 w-4 shrink-0" />
              <span className="truncate">{websiteUrl}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── GitHub Codebase Knowledge Base ────────────────────────────────── */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">GitHub Codebase Knowledge Base</h3>
        <p className="text-sm text-gray-500 mb-4">
          Fetch a knowledge base JSON file from the configured GitHub repository.
        </p>

        {!githubConfigured ? (
          /* ── Not configured notice ── */
          <div className="flex flex-col gap-4 p-4 bg-amber-50 border border-amber-200 rounded-md">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">GitHub integration is not configured</p>
                <p className="text-sm text-amber-700 mt-1">
                  A GitHub repository, access token, and default branch must be set in the global
                  application settings before you can fetch a codebase knowledge base.
                </p>
              </div>
            </div>
            {isSuperAdmin && (
              <div>
                <a href="/settings#github">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Configure GitHub in Settings
                  </Button>
                </a>
              </div>
            )}
          </div>
        ) : (
          /* ── Configured: show file path + fetch ── */
          <div className="space-y-4">
            <div>
              <Label htmlFor="github-file-path">File Path in Repository</Label>
              <p className="text-xs text-gray-500 mt-1 mb-2">
                Path to the knowledge base JSON file inside the repository.
                Default: <code className="bg-gray-100 px-1 rounded">plugins/{projectSlug}/knowledge_base.json</code>
              </p>
              <Input
                id="github-file-path"
                type="text"
                value={githubFilePath}
                onChange={(e) => setGithubFilePath(e.target.value)}
                placeholder={`plugins/${projectSlug}/knowledge_base.json`}
                className="mt-1"
                disabled={!isSuperAdmin || isFetchingGithub}
              />
            </div>

            {isSuperAdmin && (
              <div className="flex items-center gap-2 pt-2">
                <Button
                  onClick={handleFetchCodebaseKB}
                  disabled={isFetchingGithub}
                >
                  {isFetchingGithub ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Fetching...</>
                  ) : (
                    <><GitBranch className="h-4 w-4 mr-2" />Fetch Knowledge Base</>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
