"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Save, Globe, RefreshCw, CheckCircle2, XCircle,
  GitBranch, AlertCircle, ExternalLink, Upload, X, Pencil,
} from "lucide-react";
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

interface KbStatus {
  savedAt: string;
  metadata: Record<string, unknown>;
}

interface SavedKbs {
  upload?: KbStatus;
  website?: KbStatus;
  codebase?: KbStatus;
}

// ── Saved state banner ─────────────────────────────────────────────────────────

function SavedBanner({
  label,
  detail,
  savedAt,
  onEdit,
  isSuperAdmin,
}: {
  label: string;
  detail?: string;
  savedAt: string;
  onEdit: () => void;
  isSuperAdmin: boolean;
}) {
  const date = new Date(savedAt).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });

  return (
    <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-md">
      <div className="flex items-center gap-3 min-w-0">
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-green-800">{label}</p>
          {detail && (
            <p className="text-xs text-green-700 truncate">{detail}</p>
          )}
          <p className="text-xs text-green-600">Last updated {date}</p>
        </div>
      </div>
      {isSuperAdmin && (
        <Button variant="ghost" size="sm" onClick={onEdit} className="shrink-0 ml-3">
          <Pencil className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function KnowledgeBaseSettings({
  projectSlug,
  projectName,
  projectMetadata,
  isSuperAdmin,
  githubConfigured,
}: KnowledgeBaseSettingsProps) {
  const router = useRouter();
  const { toast } = useToast();

  // ── Saved KB status ────────────────────────────────────────────────────────
  const [savedKbs, setSavedKbs] = useState<SavedKbs | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Which sections are in "edit" mode
  const [editMode, setEditMode] = useState({ upload: false, website: false, codebase: false });

  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/projects/${projectSlug}/knowledge-base/status`);
      if (res.ok) setSavedKbs(await res.json());
    } catch { /* ignore */ }
    finally { setLoadingStatus(false); }
  };

  useEffect(() => { fetchStatus(); }, [projectSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Upload state ──────────────────────────────────────────────────────────
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadData, setUploadData] = useState<unknown>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.endsWith(".json")) {
      toast({ title: "Invalid file type", description: "Please upload a JSON file", variant: "destructive" });
      return;
    }
    try {
      setUploadFile(file);
      setUploadData(JSON.parse(await file.text()));
    } catch {
      toast({ title: "Invalid JSON", description: "The file contains invalid JSON", variant: "destructive" });
    }
  };

  const handleUploadKB = async () => {
    if (!uploadData) return;
    setIsUploading(true);
    try {
      const res = await fetch(`/api/projects/${projectSlug}/knowledge-base/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: uploadData }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Upload failed");
      toast({ title: "Saved", description: "Knowledge base uploaded successfully" });
      setUploadFile(null);
      setUploadData(null);
      setEditMode((m) => ({ ...m, upload: false }));
      await fetchStatus();
      router.refresh();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Upload failed", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  // ── Website (crawl) state ──────────────────────────────────────────────────
  const [websiteUrl, setWebsiteUrl] = useState(projectMetadata?.siteLink || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
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
              const saveRes = await fetch(`/api/projects/${projectSlug}/knowledge-base/save`, { method: "POST" });
              saveOk = saveRes.ok;
              if (!saveRes.ok) {
                const saveErr = await saveRes.json().catch(() => ({}));
                toast({ title: "Save Failed", description: saveErr?.error || "Crawl completed but failed to save.", variant: "destructive" });
              }
            } catch {
              toast({ title: "Save Failed", description: "Crawl completed but failed to save.", variant: "destructive" });
            }
            if (saveOk) {
              toast({ title: "Done", description: "Website knowledge base is ready." });
              setEditMode((m) => ({ ...m, website: false }));
              await fetchStatus();
            }
            router.refresh();
          } else {
            toast({ title: "Error", description: data.error || "Crawl failed.", variant: "destructive" });
          }
        }
      } catch { /* ignore transient poll errors */ }
    }, 2000);
  };

  const isValidUrl = (value: string) => { try { new URL(value); return true; } catch { return false; } };

  const handleSaveWebsiteUrl = async () => {
    if (!websiteUrl.trim() || !isValidUrl(websiteUrl)) {
      toast({ title: "Error", description: "Please enter a valid website URL", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName, slug: projectSlug, metadata: { ...projectMetadata, siteLink: websiteUrl } }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to save URL");
      toast({ title: "Saved", description: "Website URL saved" });
      router.refresh();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFetchKnowledgeBase = async () => {
    if (!websiteUrl.trim() || !isValidUrl(websiteUrl)) {
      toast({ title: "Error", description: "Please enter a valid website URL", variant: "destructive" });
      return;
    }
    setIsFetching(true);
    setCrawlProgress({ status: "crawling", progress: 0, message: "Starting crawl..." });
    try {
      const res = await fetch(`/api/projects/${projectSlug}/knowledge-base/fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to start crawl");
      toast({ title: "Started", description: "Crawling website in the background..." });
      startPolling();
    } catch (error) {
      setIsFetching(false);
      setCrawlProgress(null);
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed", variant: "destructive" });
    }
  };

  const handleCancelCrawl = async () => {
    try { await fetch(`/api/projects/${projectSlug}/knowledge-base/cancel`, { method: "POST" }); } catch { /* ignore */ }
    stopPolling();
    setIsFetching(false);
    setCrawlProgress((prev) => prev ? { ...prev, status: "error", message: "Crawl cancelled by user.", progress: prev.progress } : null);
  };

  const showProgress = isFetching || (crawlProgress && crawlProgress.status !== "idle");

  // ── GitHub (codebase) state ────────────────────────────────────────────────
  const [githubFilePath, setGithubFilePath] = useState(
    projectMetadata?.githubKbFilePath || `plugins/${projectSlug}/knowledge_base.json`
  );
  const [isFetchingGithub, setIsFetchingGithub] = useState(false);

  const handleFetchCodebaseKB = async () => {
    setIsFetchingGithub(true);
    try {
      const res = await fetch(`/api/projects/${projectSlug}/knowledge-base/fetch-codebase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: githubFilePath.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to fetch");
      const result = await res.json();
      toast({ title: "Saved", description: `Codebase knowledge base fetched from ${result.repo} (${result.filePath})` });
      setEditMode((m) => ({ ...m, codebase: false }));
      await fetchStatus();
      router.refresh();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed", variant: "destructive" });
    } finally {
      setIsFetchingGithub(false);
    }
  };

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loadingStatus) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white border rounded-lg p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* Upload Knowledge Base                                               */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white border rounded-lg p-6">
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-base font-semibold text-gray-900">Upload Knowledge Base</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Upload a JSON knowledge base file for this project.
        </p>

        {savedKbs?.upload && !editMode.upload ? (
          <SavedBanner
            label="Knowledge base file uploaded"
            savedAt={savedKbs.upload.savedAt}
            onEdit={() => setEditMode((m) => ({ ...m, upload: true }))}
            isSuperAdmin={isSuperAdmin}
          />
        ) : isSuperAdmin ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                id="kb-upload"
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileSelect}
                disabled={isUploading}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById("kb-upload")?.click()}
                disabled={isUploading}
              >
                <Upload className="h-4 w-4 mr-2" />
                Choose JSON File
              </Button>
              {uploadFile && (
                <div className="flex items-center gap-2 flex-1 p-2 border rounded-md bg-gray-50 min-w-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{uploadFile.name}</p>
                    <p className="text-xs text-gray-500">{(uploadFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setUploadFile(null); setUploadData(null); }}
                    disabled={isUploading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500">
              Upload a JSON file containing product information, features, and writing guidelines.
            </p>

            <div className="flex items-center gap-2">
              {uploadFile && (
                <Button onClick={handleUploadKB} disabled={isUploading}>
                  {isUploading
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                    : <><Save className="h-4 w-4 mr-2" />Save Knowledge Base</>}
                </Button>
              )}
              {editMode.upload && (
                <Button
                  variant="ghost"
                  onClick={() => { setEditMode((m) => ({ ...m, upload: false })); setUploadFile(null); setUploadData(null); }}
                  disabled={isUploading}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* Website Knowledge Base                                              */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Website Knowledge Base</h3>
        <p className="text-sm text-gray-500 mb-4">
          Crawl a website to build a knowledge base for this project.
        </p>

        {savedKbs?.website && !editMode.website ? (
          <SavedBanner
            label="Website knowledge base saved"
            detail={(savedKbs.website.metadata.siteLink as string | undefined) || undefined}
            savedAt={savedKbs.website.savedAt}
            onEdit={() => setEditMode((m) => ({ ...m, website: true }))}
            isSuperAdmin={isSuperAdmin}
          />
        ) : isSuperAdmin ? (
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
                disabled={isSaving || isFetching}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSaveWebsiteUrl} disabled={isSaving || isFetching}>
                {isSaving
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                  : <><Save className="h-4 w-4 mr-2" />Save Website URL</>}
              </Button>

              <Button variant="outline" onClick={handleFetchKnowledgeBase} disabled={isFetching || isSaving}>
                {isFetching
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Fetching...</>
                  : <><RefreshCw className="h-4 w-4 mr-2" />Fetch Knowledge Base</>}
              </Button>

              {isFetching && (
                <Button variant="destructive" onClick={handleCancelCrawl}>
                  <XCircle className="h-4 w-4 mr-2" />Cancel
                </Button>
              )}

              {editMode.website && !isFetching && (
                <Button variant="ghost" onClick={() => setEditMode((m) => ({ ...m, website: false }))}>
                  Cancel
                </Button>
              )}
            </div>

            {showProgress && crawlProgress && (
              <div className="p-4 bg-gray-50 rounded-md space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  {crawlProgress.status === "done"
                    ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    : crawlProgress.status === "error"
                    ? <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                    : <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />}
                  <span>{crawlProgress.message}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      crawlProgress.status === "error" ? "bg-red-500"
                      : crawlProgress.status === "done" ? "bg-green-500"
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
                      : crawlProgress.status === "done" ? "Complete"
                      : crawlProgress.status === "error" ? "Failed"
                      : "Initializing..."}
                  </span>
                  <span>{crawlProgress.progress}%</span>
                </div>
              </div>
            )}

            {websiteUrl && !showProgress && (
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md text-sm text-gray-700">
                <Globe className="h-4 w-4 shrink-0" />
                <span className="truncate">{websiteUrl}</span>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* GitHub Codebase Knowledge Base                                      */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">GitHub Codebase Knowledge Base</h3>
        <p className="text-sm text-gray-500 mb-4">
          Fetch a knowledge base JSON file from the configured GitHub repository.
        </p>

        {!githubConfigured ? (
          <div className="flex flex-col gap-4 p-4 bg-amber-50 border border-amber-200 rounded-md">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">GitHub integration is not configured</p>
                <p className="text-sm text-amber-700 mt-1">
                  A GitHub repository, access token, and default branch must be configured in the
                  global application settings before you can fetch a codebase knowledge base.
                </p>
              </div>
            </div>
            {isSuperAdmin && (
              <a href="/settings#github">
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Configure GitHub in Settings
                </Button>
              </a>
            )}
          </div>
        ) : savedKbs?.codebase && !editMode.codebase ? (
          <SavedBanner
            label="Codebase knowledge base saved"
            detail={[
              savedKbs.codebase.metadata.githubRepo as string | undefined,
              savedKbs.codebase.metadata.filePath as string | undefined,
            ].filter(Boolean).join(" · ")}
            savedAt={savedKbs.codebase.savedAt}
            onEdit={() => setEditMode((m) => ({ ...m, codebase: true }))}
            isSuperAdmin={isSuperAdmin}
          />
        ) : isSuperAdmin ? (
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
                disabled={isFetchingGithub}
              />
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={handleFetchCodebaseKB} disabled={isFetchingGithub}>
                {isFetchingGithub
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Fetching...</>
                  : <><GitBranch className="h-4 w-4 mr-2" />Fetch Knowledge Base</>}
              </Button>
              {editMode.codebase && (
                <Button
                  variant="ghost"
                  onClick={() => setEditMode((m) => ({ ...m, codebase: false }))}
                  disabled={isFetchingGithub}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </div>

    </div>
  );
}
