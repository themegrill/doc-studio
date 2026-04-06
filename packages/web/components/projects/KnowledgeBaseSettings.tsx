"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Save, Globe, RefreshCw, CheckCircle2, XCircle,
  GitBranch, AlertCircle, ExternalLink, Upload, X, Pencil,
  ImageIcon, Download, Sparkles, Eye
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// ── Types ──────────────────────────────────────────────────────────────────────

interface KbEntry {
  type: "upload" | "website" | "codebase" | "ui_flow";
  metadata: Record<string, unknown>;
  updatedAt: string;
}

interface UiFlowImage {
  name: string;
  size: number;
  url: string;
}

interface KnowledgeBaseSettingsProps {
  projectSlug: string;
  projectName: string;
  projectMetadata: Record<string, any>;
  isSuperAdmin: boolean;
  githubConfigured: boolean;
  existingKbs: KbEntry[];
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ── Saved indicator card ───────────────────────────────────────────────────────

function SavedCard({
  label,
  detail,
  updatedAt,
  onEdit,
  disabled,
}: {
  label: string;
  detail: string;
  updatedAt: string;
  onEdit: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-md">
      <div className="flex items-start gap-3 min-w-0">
        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-green-900">{label}</p>
          {detail && (
            <p className="text-xs text-green-700 truncate mt-0.5">{detail}</p>
          )}
          <p className="text-xs text-green-600 mt-0.5">
            Last updated: {formatDate(updatedAt)}
          </p>
        </div>
      </div>
      {!disabled && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className="shrink-0 ml-4 text-green-700 hover:text-green-900 hover:bg-green-100"
        >
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
  existingKbs,
}: KnowledgeBaseSettingsProps) {
  const router = useRouter();
  const { toast } = useToast();

  // Resolve which types are already saved
  const savedMap = Object.fromEntries(
    existingKbs.map((e) => [e.type, e])
  ) as Partial<Record<KbEntry["type"], KbEntry>>;

  // Per-section edit mode
  const [editingUpload, setEditingUpload] = useState(!savedMap.upload);
  const [editingWebsite, setEditingWebsite] = useState(!savedMap.website);
  const [editingCodebase, setEditingCodebase] = useState(!savedMap.codebase);

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
      const text = await file.text();
      const data = JSON.parse(text);
      setUploadFile(file);
      setUploadData(data);
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

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }

      toast({ title: "Saved", description: "Knowledge base uploaded successfully" });
      setUploadFile(null);
      setUploadData(null);
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Upload failed",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // ── Website state ──────────────────────────────────────────────────────────
  const [websiteUrl, setWebsiteUrl] = useState(projectMetadata?.siteLink || "");
  const [isSavingUrl, setIsSavingUrl] = useState(false);
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
            toast({ title: "Done", description: "Website knowledge base is ready." });
            router.refresh();
          } else {
            toast({ title: "Error", description: data.error || "Crawl failed.", variant: "destructive" });
          }
        }
      } catch { /* ignore transient poll errors */ }
    }, 2000);
  };

  const isValidUrl = (v: string) => { try { new URL(v); return true; } catch { return false; } };

  const handleSaveWebsiteUrl = async () => {
    if (!websiteUrl.trim() || !isValidUrl(websiteUrl)) {
      toast({ title: "Error", description: "Please enter a valid website URL", variant: "destructive" });
      return;
    }
    setIsSavingUrl(true);
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
      setIsSavingUrl(false);
    }
  };

  const handleFetchKnowledgeBase = async () => {
    if (!websiteUrl.trim() || !isValidUrl(websiteUrl)) {
      toast({ title: "Error", description: "Please enter a valid website URL first", variant: "destructive" });
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

  // ── Codebase state ─────────────────────────────────────────────────────────
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
      if (!res.ok) throw new Error((await res.json()).error || "Fetch failed");
      const result = await res.json();
      toast({ title: "Saved", description: `Codebase knowledge base fetched from ${result.repo} (${result.filePath})` });
      router.refresh();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Fetch failed", variant: "destructive" });
    } finally {
      setIsFetchingGithub(false);
    }
  };

  // ── UI Flow state ──────────────────────────────────────────────────────────
  const [editingUiFlow, setEditingUiFlow] = useState(!savedMap.ui_flow);
  const [uiFlowImages, setUiFlowImages] = useState<UiFlowImage[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [isGeneratingUiFlow, setIsGeneratingUiFlow] = useState(false);
  const [selectedUiFlowImage, setSelectedUiFlowImage] = useState<UiFlowImage | null>(null);
  const [imageToDelete, setImageToDelete] = useState<UiFlowImage | null>(null);

  const loadUiFlowImages = async () => {
    setIsLoadingImages(true);
    try {
      const res = await fetch(`/api/projects/${projectSlug}/knowledge-base/ui-flow/images`);
      if (res.ok) {
        const data = await res.json();
        setUiFlowImages(data.images || []);
      }
    } catch { /* ignore */ }
    finally { setIsLoadingImages(false); }
  };

  useEffect(() => {
    if (editingUiFlow) loadUiFlowImages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingUiFlow]);

  const handleUiFlowImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;

    setIsUploadingImages(true);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("images", f));
      const res = await fetch(`/api/projects/${projectSlug}/knowledge-base/ui-flow/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (data.errors?.length) {
        toast({ title: "Some files skipped", description: data.errors.join("; "), variant: "destructive" });
      }
      if (data.saved?.length) {
        toast({ title: "Uploaded", description: `${data.saved.length} image(s) uploaded` });
        await loadUiFlowImages();
      }
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Upload failed", variant: "destructive" });
    } finally {
      setIsUploadingImages(false);
    }
  };

  const handleDeleteUiFlowImage = async (filename: string) => {
    try {
      await fetch(`/api/projects/${projectSlug}/knowledge-base/ui-flow/images`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      setUiFlowImages((prev) => prev.filter((img) => img.name !== filename));
    } catch {
      toast({ title: "Error", description: "Failed to delete image", variant: "destructive" });
    }
  };

  const handleDownloadUiFlowImages = () => {
    window.location.href = `/api/projects/${projectSlug}/knowledge-base/ui-flow/download`;
  };

  const handleGenerateUiFlowKB = async () => {
    setIsGeneratingUiFlow(true);
    try {
      const res = await fetch(`/api/projects/${projectSlug}/knowledge-base/ui-flow/generate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      toast({
        title: "Done",
        description: `UI flow knowledge base generated from ${data.summary.succeeded}/${data.summary.processed} images`,
      });
      router.refresh();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Generation failed", variant: "destructive" });
    } finally {
      setIsGeneratingUiFlow(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Upload Knowledge Base ──────────────────────────────────────────── */}
      <div className="bg-white border rounded-lg p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-semibold text-gray-900">Upload Knowledge Base</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Upload a JSON knowledge base file for this project.
        </p>

        {!editingUpload && savedMap.upload ? (
          <SavedCard
            label="Knowledge base file saved"
            detail="Uploaded JSON knowledge base"
            updatedAt={savedMap.upload.updatedAt}
            onEdit={() => setEditingUpload(true)}
            disabled={!isSuperAdmin}
          />
        ) : (
          isSuperAdmin && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
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

              <div className="flex gap-2">
                {uploadFile && (
                  <Button onClick={handleUploadKB} disabled={isUploading}>
                    {isUploading
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                      : <><Save className="h-4 w-4 mr-2" />Save Knowledge Base</>}
                  </Button>
                )}
                {savedMap.upload && (
                  <Button variant="ghost" onClick={() => { setUploadFile(null); setUploadData(null); setEditingUpload(false); }} disabled={isUploading}>
                    Cancel
                  </Button>
                )}
              </div>

              <p className="text-xs text-gray-500">
                Upload a JSON file containing product information, features, and writing guidelines.
              </p>
            </div>
          )
        )}
      </div>

      {/* ── Website Knowledge Base ─────────────────────────────────────────── */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Website Knowledge Base</h3>
        <p className="text-sm text-gray-500 mb-4">
          Crawl a website to build a knowledge base for this project.
        </p>

        {!editingWebsite && savedMap.website ? (
          <SavedCard
            label="Website knowledge base saved"
            detail={(savedMap.website.metadata.siteLink as string) || ""}
            updatedAt={savedMap.website.updatedAt}
            onEdit={() => setEditingWebsite(true)}
            disabled={!isSuperAdmin}
          />
        ) : (
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
                disabled={!isSuperAdmin || isSavingUrl || isFetching}
              />
            </div>

            {isSuperAdmin && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={handleSaveWebsiteUrl} disabled={isSavingUrl || isFetching}>
                  {isSavingUrl
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                    : <><Save className="h-4 w-4 mr-2" />Save Website URL</>}
                </Button>

                <Button variant="outline" onClick={handleFetchKnowledgeBase} disabled={isFetching || isSavingUrl}>
                  {isFetching
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Fetching...</>
                    : <><RefreshCw className="h-4 w-4 mr-2" />Fetch Knowledge Base</>}
                </Button>

                {isFetching && (
                  <Button variant="destructive" onClick={handleCancelCrawl}>
                    <XCircle className="h-4 w-4 mr-2" />Cancel
                  </Button>
                )}

                {savedMap.website && !isFetching && (
                  <Button variant="ghost" onClick={() => setEditingWebsite(false)}>
                    Cancel
                  </Button>
                )}
              </div>
            )}

            {showProgress && crawlProgress && (
              <div className="mt-4 p-4 bg-gray-50 rounded-md space-y-2">
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

            {websiteUrl && (
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md text-sm text-gray-700">
                <Globe className="h-4 w-4 shrink-0" />
                <span className="truncate">{websiteUrl}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── GitHub Codebase Knowledge Base ────────────────────────────────── */}
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
        ) : !editingCodebase && savedMap.codebase ? (
          <SavedCard
            label="Codebase knowledge base saved"
            detail={[
              savedMap.codebase.metadata.githubRepo as string,
              savedMap.codebase.metadata.filePath as string,
            ].filter(Boolean).join(" → ")}
            updatedAt={savedMap.codebase.updatedAt}
            onEdit={() => setEditingCodebase(true)}
            disabled={!isSuperAdmin}
          />
        ) : (
          isSuperAdmin && (
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

              <div className="flex gap-2">
                <Button onClick={handleFetchCodebaseKB} disabled={isFetchingGithub}>
                  {isFetchingGithub
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Fetching...</>
                    : <><GitBranch className="h-4 w-4 mr-2" />Fetch Knowledge Base</>}
                </Button>
                {savedMap.codebase && (
                  <Button variant="ghost" onClick={() => setEditingCodebase(false)} disabled={isFetchingGithub}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )
        )}
      </div>

      {/* ── UI Flow Knowledge Base ────────────────────────────────────────── */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">UI Flow Knowledge Base</h3>
        <p className="text-sm text-gray-500 mb-4">
          Upload UI design screenshots to generate a knowledge base from screen flows, fields, and actions.
        </p>

        {!editingUiFlow && savedMap.ui_flow ? (
          <SavedCard
            label="UI flow knowledge base saved"
            detail={`${(savedMap.ui_flow.metadata.imageCount as number) ?? 0} image(s) processed`}
            updatedAt={savedMap.ui_flow.updatedAt}
            onEdit={() => { setEditingUiFlow(true); loadUiFlowImages(); }}
            disabled={!isSuperAdmin}
          />
        ) : (
          isSuperAdmin && (
            <div className="space-y-4">
              {/* Upload button */}
              <div>
                <input
                  id="ui-flow-upload"
                  type="file"
                  accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                  multiple
                  className="hidden"
                  onChange={handleUiFlowImageUpload}
                  disabled={isUploadingImages || isGeneratingUiFlow}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById("ui-flow-upload")?.click()}
                  disabled={isUploadingImages || isGeneratingUiFlow}
                >
                  {isUploadingImages
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</>
                    : <><Upload className="h-4 w-4 mr-2" />Upload Images</>}
                </Button>
                <p className="text-xs text-gray-500 mt-2">
                  Accepts PNG and JPG files (max 10 MB each). Multiple files can be selected at once.
                </p>
              </div>

              {/* Image list / empty state */}
              {isLoadingImages ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />Loading images...
                </div>
              ) : uiFlowImages.length > 0 ? (
                <div className="space-y-3">
                  {/* Header with view + download */}
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">
                      UI Flow Images ({uiFlowImages.length})
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleDownloadUiFlowImages}>
                        <Download className="h-4 w-4 mr-1" />Download
                      </Button>
                    </div>
                  </div>

                  {/* Thumbnail grid */}
                  <div className="grid grid-cols-3 sm:grid-cols-8 gap-2">
                    {uiFlowImages.map((img) => (
                      <div
						key={img.name}
						className="relative group border rounded-lg overflow-hidden bg-gray-50 w-28 sm:w-32 aspect-square shadow-sm hover:shadow-md transition-all"
						>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={img.url}
							alt={img.name}
							className="w-full h-full object-cover"
						/>

						{/* Hover actions */}
							<div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors">
								<div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
									<button
										type="button"
										onClick={() => setSelectedUiFlowImage(img)}
										className="bg-white/95 rounded-full p-1.5 text-gray-700 hover:text-blue-600 shadow"
										title="View image"
									>
										<Eye className="h-3.5 w-3.5" />
									</button>

									<button
										type="button"
										onClick={() => setImageToDelete(img)}
										className="bg-white/95 rounded-full p-1.5 text-gray-700 hover:text-red-600 shadow"
										title="Remove image"
										>
											<X className="h-3.5 w-3.5" />
									</button>
								</div>
							</div>

							{/* Filename */}
							<div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/55">
								<p className="text-white text-[10px] truncate">{img.name}</p>
							</div>
						</div>
                    ))}
                  </div>

                  {/* Generate button */}
                  <div className="flex gap-2 pt-1">
                    <Button onClick={handleGenerateUiFlowKB} disabled={isGeneratingUiFlow}>
                      {isGeneratingUiFlow
                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</>
                        : <><Sparkles className="h-4 w-4 mr-2" />Generate Knowledge Base</>}
                    </Button>
                    {savedMap.ui_flow && (
                      <Button variant="ghost" onClick={() => setEditingUiFlow(false)} disabled={isGeneratingUiFlow}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 bg-gray-50 border border-dashed rounded-md text-sm text-gray-500">
                  <ImageIcon className="h-5 w-5 shrink-0" />
                  <span>No images uploaded yet. Upload PNG or JPG screenshots to get started.</span>
                </div>
              )}
            </div>
          )
        )}
      </div>
	  <Dialog
		open={!!selectedUiFlowImage}
		onOpenChange={(open) => {
			if (!open) setSelectedUiFlowImage(null);
		}}
		>
			<DialogContent className="max-w-3xl w-full">
				<DialogHeader>
				<DialogTitle>{selectedUiFlowImage?.name || "Image preview"}</DialogTitle>
				</DialogHeader>

				{selectedUiFlowImage && (
				<div className="space-y-3">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
					src={selectedUiFlowImage.url}
					alt={selectedUiFlowImage.name}
					className="w-full max-h-[70vh] object-contain rounded-md border bg-gray-50"
					/>
					<p className="text-xs text-gray-500 text-center">
					{(selectedUiFlowImage.size / 1024).toFixed(1)} KB
					</p>
				</div>
				)}
			</DialogContent>
		</Dialog>
		<AlertDialog
			open={!!imageToDelete}
			onOpenChange={(open) => {
				if (!open) setImageToDelete(null);
			}}
			>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete this image?</AlertDialogTitle>
					<AlertDialogDescription>
						This will permanently remove{" "}
						<strong>{imageToDelete?.name}</strong> from the UI Flow images list.
						This action cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
						if (!imageToDelete) return;
						await handleDeleteUiFlowImage(imageToDelete.name);
						setImageToDelete(null);
						}}
						className="bg-red-600 hover:bg-red-700"
					>
						Delete Image
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
    </div>
  );
}
