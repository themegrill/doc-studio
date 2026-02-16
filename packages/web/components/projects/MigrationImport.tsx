"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
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

export function MigrationImport({ projectSlug, projectId }: MigrationImportProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [importing, setImporting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      setError("Please upload a CSV file");
      return;
    }

    setFile(selectedFile);
    setError(null);
    setStats(null);
    setResult(null);

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
    setResult(null);

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
      setResult(data.result);

      // Refresh the page after successful import
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

  const handleReset = () => {
    setFile(null);
    setStats(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      {/* Info Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900">
              Importing from BetterDocs
            </h3>
            <p className="text-sm text-blue-700 mt-1">
              Upload a CSV file exported from BetterDocs. All documents will be
              imported into this project, and existing documents with the same
              slug will be overwritten.
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
              <label htmlFor="csv-upload">
                <Button type="button" onClick={() => document.getElementById('csv-upload')?.click()}>
                  <Upload className="mr-2 h-4 w-4" />
                  Select CSV File
                </Button>
              </label>
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
      {file && !result && (
        <div className="border rounded-lg p-4">
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
              disabled={importing || analyzing}
            >
              Remove
            </Button>
          </div>

          {/* Analysis Loading */}
          {analyzing && (
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing CSV file...
            </div>
          )}

          {/* Stats Display */}
          {stats && !analyzing && (
            <div className="mt-4 p-4 bg-gray-50 rounded-md space-y-3">
              <h4 className="font-medium text-sm">Analysis Results:</h4>
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
                    Knowledge Bases found:
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

          {/* Import Button */}
          {stats && !analyzing && (
            <div className="mt-4 flex justify-end">
              <Button
                onClick={handleImport}
                disabled={importing}
                size="lg"
              >
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Start Import
                  </>
                )}
              </Button>
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

      {/* Success Result */}
      {result && result.success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-green-900">
                Import Successful!
              </h4>
              <p className="text-sm text-green-700 mt-1">
                Successfully imported {result.imported} document(s).
                {result.failed > 0 && ` ${result.failed} document(s) failed.`}
              </p>
              {result.errors && result.errors.length > 0 && (
                <div className="mt-2 text-sm text-green-800">
                  <p className="font-medium">Errors:</p>
                  <ul className="list-disc list-inside">
                    {result.errors.map((err, i) => (
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
    </div>
  );
}
