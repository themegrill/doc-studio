"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2, BookOpen, FolderInput } from "lucide-react";
import { useRouter } from "next/navigation";

interface MigrationImportProps {
  projectSlug: string;
  projectId: string;
}

interface ImportStats {
  totalDocs: number;
  knowledgeBases: string[];
  categories: string[];
}

interface ImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors?: string[];
}

interface ExtractResult {
  success: boolean;
  extracted: number;
  skipped: number;
}

interface ExtractProgress {
  current: number;
  total: number;
  title: string;
}

type ChosenAction = "migrate" | "extract-knowledge" | null;

export function MigrationImport({ projectSlug, projectId }: MigrationImportProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [chosenAction, setChosenAction] = useState<ChosenAction>(null);
  const [importing, setImporting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [extractProgress, setExtractProgress] = useState<ExtractProgress | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith(".csv")) {
      setError("Please upload a CSV file");
      return;
    }

    setFile(selectedFile);
    setError(null);
    setStats(null);
    setImportResult(null);
    setExtractResult(null);
    setChosenAction(null);

    // Analyze the CSV file
    setAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("action", "analyze");

      const response = await fetch(`/api/projects/${projectSlug}/import`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to analyze CSV file");
      }

      const data = await response.json();
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze file");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    setError(null);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("action", "import");
      formData.append("projectId", projectId);

      const response = await fetch(`/api/projects/${projectSlug}/import`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to import documentation");
      }

      const data = await response.json();
      setImportResult(data.result);

      if (data.result.success) {
        setTimeout(() => {
          router.refresh();
        }, 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import");
    } finally {
      setImporting(false);
    }
  };

  const handleExtractKnowledge = async () => {
    if (!file) return;

    const BATCH_SIZE = 20;

    setExtracting(true);
    setError(null);
    setExtractResult(null);
    setExtractProgress({ current: 0, total: stats?.totalDocs ?? 0, title: "Starting…" });

    try {
      let startIndex = 0;
      let totalExtracted = 0;
      let totalSkipped = 0;
      let totalPublished = stats?.totalDocs ?? 0;

      while (true) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("action", "extract-knowledge");
        formData.append("projectId", projectId);
        formData.append("startIndex", String(startIndex));
        formData.append("batchSize", String(BATCH_SIZE));

        const response = await fetch(`/api/projects/${projectSlug}/import`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const text = await response.text();
          let msg = "Failed to extract knowledge base";
          try { msg = JSON.parse(text).error || msg; } catch { /* not json */ }
          throw new Error(msg);
        }

        const data = await response.json() as {
          result: { extracted: number; skipped: number; done: boolean; nextIndex: number; totalPublished: number };
        };
        const { result } = data;

        totalExtracted += result.extracted;
        totalSkipped += result.skipped;
        totalPublished = result.totalPublished;
        startIndex = result.nextIndex;

        setExtractProgress({
          current: Math.min(startIndex, totalPublished),
          total: totalPublished,
          title: `Batch ${Math.ceil(startIndex / BATCH_SIZE)} of ${Math.ceil(totalPublished / BATCH_SIZE)}`,
        });

        if (result.done) break;
      }

      setExtractResult({ success: totalExtracted > 0, extracted: totalExtracted, skipped: totalSkipped });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extract knowledge base");
    } finally {
      setExtracting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setStats(null);
    setImportResult(null);
    setExtractResult(null);
    setExtractProgress(null);
    setError(null);
    setChosenAction(null);
  };

  const isBusy = importing || extracting || analyzing;

  return (
    <div className="space-y-6">
      {/* Info Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900">Importing from BetterDocs</h3>
            <p className="text-sm text-blue-700 mt-1">
              Upload a CSV file exported from BetterDocs. Choose to migrate the
              docs directly or extract a knowledge base for the AI writing
              assistant.
            </p>
          </div>
        </div>
      </div>

      {/* File Upload */}
      {!file && (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8">
          <div className="text-center">
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <div className="mt-4">
              <Button
                type="button"
                onClick={() => document.getElementById("csv-upload")?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Select CSV File
              </Button>
              <input
                id="csv-upload"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              CSV file exported from BetterDocs
            </p>
          </div>
        </div>
      )}

      {/* File Selected */}
      {file && !importResult && !extractResult && (
        <div className="border rounded-lg p-4 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-blue-600" />
              <div>
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-gray-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={isBusy}
            >
              Remove
            </Button>
          </div>

          {/* Analysis Loading */}
          {analyzing && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing CSV file...
            </div>
          )}

          {/* Stats Display */}
          {stats && !analyzing && (
            <div className="p-4 bg-gray-50 rounded-md space-y-3">
              <h4 className="font-medium text-sm">Analysis Results</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Total Documents</p>
                  <p className="text-lg font-semibold">{stats.totalDocs}</p>
                </div>
                <div>
                  <p className="text-gray-600">Knowledge Bases</p>
                  <p className="text-lg font-semibold">
                    {stats.knowledgeBases.length}
                  </p>
                </div>
              </div>
              {stats.knowledgeBases.length > 0 && (
                <div>
                  <p className="text-xs text-gray-600 mb-2">
                    Knowledge bases found:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {stats.knowledgeBases.map((kb, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-white border rounded text-xs"
                      >
                        {kb}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Choice */}
          {stats && !analyzing && !chosenAction && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">
                What would you like to do with this CSV?
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Extract Knowledge Base */}
                <button
                  onClick={() => setChosenAction("extract-knowledge")}
                  className="text-left border-2 border-gray-200 rounded-lg p-4 hover:border-purple-400 hover:bg-purple-50 transition-colors group"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="h-5 w-5 text-purple-600" />
                    <span className="font-medium text-sm text-gray-900">
                      Extract Knowledge Base
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Use AI to extract structured knowledge from your docs and
                    save it as a reference for the writing assistant. Ideal when
                    your existing docs may be outdated.
                  </p>
                </button>

                {/* Migrate Docs */}
                <button
                  onClick={() => setChosenAction("migrate")}
                  className="text-left border-2 border-gray-200 rounded-lg p-4 hover:border-blue-400 hover:bg-blue-50 transition-colors group"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <FolderInput className="h-5 w-5 text-blue-600" />
                    <span className="font-medium text-sm text-gray-900">
                      Migrate Docs
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Import all documents directly into this project, preserving
                    structure, categories, and navigation. Existing docs with
                    the same slug will be overwritten.
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Extract Knowledge Base Confirmation */}
          {chosenAction === "extract-knowledge" && !extracting && (
            <div className="space-y-3">
              <div className="bg-purple-50 border border-purple-200 rounded-md p-3 text-sm text-purple-800">
                Claude will read each document and extract key concepts, steps,
                and feature descriptions — stripping outdated UI references.
                The result is saved as a knowledge base that the writing
                assistant uses as reference context.
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setChosenAction(null)}
                >
                  Back
                </Button>
                <Button
                  onClick={handleExtractKnowledge}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <BookOpen className="mr-2 h-4 w-4" />
                  Extract Knowledge Base
                </Button>
              </div>
            </div>
          )}

          {/* Extracting Progress */}
          {extracting && (
            <div className="bg-purple-50 border border-purple-200 rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between text-sm text-purple-700">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                  <span>
                    {extractProgress?.title ?? "Starting extraction…"}
                  </span>
                </div>
                {extractProgress && extractProgress.total > 0 && (
                  <span className="text-xs font-medium tabular-nums">
                    {Math.min(extractProgress.current, extractProgress.total)}/{extractProgress.total} docs
                  </span>
                )}
              </div>
              {extractProgress && extractProgress.total > 0 && (
                <div className="w-full bg-purple-200 rounded-full h-1.5">
                  <div
                    className="bg-purple-600 h-1.5 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.round((Math.min(extractProgress.current, extractProgress.total) / extractProgress.total) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Migrate Docs Confirmation */}
          {chosenAction === "migrate" && !importing && (
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setChosenAction(null)}
              >
                Back
              </Button>
              <Button onClick={handleImport} disabled={importing} size="lg">
                <Upload className="mr-2 h-4 w-4" />
                Start Import
              </Button>
            </div>
          )}

          {/* Importing Progress */}
          {importing && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Importing documents...
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-red-900">Error</h4>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Import Success */}
      {importResult && importResult.success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-green-900">Import Successful!</h4>
              <p className="text-sm text-green-700 mt-1">
                Successfully imported {importResult.imported} document(s).
                {importResult.failed > 0 &&
                  ` ${importResult.failed} document(s) failed.`}
              </p>
              {importResult.errors && importResult.errors.length > 0 && (
                <div className="mt-2 text-sm text-green-800">
                  <p className="font-medium">Errors:</p>
                  <ul className="list-disc list-inside">
                    {importResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="mt-3"
              >
                Import Another File
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Extract Knowledge Base Success */}
      {extractResult && extractResult.success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-green-900">
                Knowledge Base Extracted!
              </h4>
              <p className="text-sm text-green-700 mt-1">
                Extracted knowledge from {extractResult.extracted} document(s).
                {extractResult.skipped > 0 &&
                  ` ${extractResult.skipped} document(s) were skipped (empty or failed).`}
              </p>
              <p className="text-sm text-green-700 mt-1">
                The AI writing assistant will now use this as a reference when
                helping you write documentation. It will treat UI-specific
                details as potentially outdated.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="mt-3"
              >
                Process Another File
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
