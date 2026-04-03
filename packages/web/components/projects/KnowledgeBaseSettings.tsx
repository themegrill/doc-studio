"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Globe, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface KnowledgeBaseSettingsProps {
  projectSlug: string;
  projectName: string;
  projectMetadata: Record<string, any>;
  isSuperAdmin: boolean;
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
}: KnowledgeBaseSettingsProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [websiteUrl, setWebsiteUrl] = useState(
    projectMetadata?.siteLink || ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    // On mount, check if a crawl is already in progress and resume polling
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
            // Save the crawled knowledge base to the database
            try {
              const saveRes = await fetch(`/api/projects/${projectSlug}/knowledge-base/save`, {
                method: "POST",
              });
              if (!saveRes.ok) {
                console.error("[KB] Failed to save knowledge base to database");
              }
            } catch (saveErr) {
              console.error("[KB] Error saving knowledge base to database:", saveErr);
            }
            toast({ title: "Done", description: "Knowledge base is ready." });
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

  const showProgress = isFetching || (crawlProgress && crawlProgress.status !== "idle");

  return (
    <div className="space-y-6">
      <div className="bg-white border rounded-lg p-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="website-url">Website Link</Label>
            <p className="text-xs text-gray-500 mt-2 mb-2">
              Enter the website URL you want to use as a source for the knowledge base.
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
                  <><Save className="h-4 w-4 mr-2" />Save Website Link</>
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
    </div>
  );
}
