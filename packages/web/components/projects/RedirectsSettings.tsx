"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Trash2,
  Plus,
  ArrowRight,
  Search,
  FileJson,
  ChevronLeft,
  ChevronRight,
  Upload,
  CheckSquare,
  Pencil,
  Check,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Redirect {
  from: string;
  to: string;
}

interface DocOption {
  slug: string;
  title: string;
}

interface ImportResult {
  imported: Redirect[];
  skipped: number;
  errors: string[];
}

interface RedirectsSettingsProps {
  projectSlug: string;
  initialRedirects: Redirect[];
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

type DialogMode = "add" | "import" | "confirm-delete";

// ---------------------------------------------------------------------------
// File parsing helpers
// ---------------------------------------------------------------------------

function validateRedirectEntry(
  entry: unknown,
  index: number
): { valid: true; redirect: Redirect } | { valid: false; error: string } {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    return { valid: false, error: `Entry ${index + 1}: must be an object` };
  }
  const obj = entry as Record<string, unknown>;
  if (typeof obj.from !== "string" || !obj.from.trim())
    return { valid: false, error: `Entry ${index + 1}: "from" must be a non-empty string` };
  if (typeof obj.to !== "string" || !obj.to.trim())
    return { valid: false, error: `Entry ${index + 1}: "to" must be a non-empty string` };
  if (!obj.from.startsWith("/"))
    return { valid: false, error: `Entry ${index + 1}: "from" must start with "/"` };
  if (!obj.to.startsWith("/"))
    return { valid: false, error: `Entry ${index + 1}: "to" must start with "/"` };
  return { valid: true, redirect: { from: obj.from.trim(), to: obj.to.trim() } };
}

function parseJsonFile(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      imported: [],
      skipped: 0,
      errors: ["Invalid JSON — the file could not be parsed. Make sure it is valid JSON."],
    };
  }
  if (!Array.isArray(parsed)) {
    return {
      imported: [],
      skipped: 0,
      errors: ['Invalid format — the JSON file must be an array. Expected: [{ "from": "/old", "to": "/new" }, ...]'],
    };
  }
  const imported: Redirect[] = [];
  const errors: string[] = [];
  parsed.forEach((entry, i) => {
    const result = validateRedirectEntry(entry, i);
    if (result.valid) imported.push(result.redirect);
    else errors.push(result.error);
  });
  return { imported, skipped: 0, errors };
}

function parseCsvFile(text: string): ImportResult {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { imported: [], skipped: 0, errors: ["The CSV file is empty."] };
  const header = lines[0].toLowerCase().replace(/"/g, "").trim();
  if (header !== "from,to") {
    return {
      imported: [],
      skipped: 0,
      errors: [
        `Invalid CSV header. Expected "from,to" but got: "${lines[0].trim()}". ` +
          "Make sure the first row is the header with columns: from, to",
      ],
    };
  }
  const dataLines = lines.slice(1).filter((l) => l.trim() !== "");
  if (dataLines.length === 0)
    return { imported: [], skipped: 0, errors: ["The CSV file has a header but no data rows."] };

  const imported: Redirect[] = [];
  const errors: string[] = [];
  dataLines.forEach((line, i) => {
    const commaIdx = line.indexOf(",");
    if (commaIdx === -1) {
      errors.push(`Row ${i + 2}: missing comma — each row must have two columns (from, to)`);
      return;
    }
    const from = line.slice(0, commaIdx).trim().replace(/^"|"$/g, "");
    const to = line.slice(commaIdx + 1).trim().replace(/^"|"$/g, "");
    const result = validateRedirectEntry({ from, to }, i);
    if (result.valid) imported.push(result.redirect);
    else errors.push(`Row ${i + 2}: ${result.error.replace(`Entry ${i + 1}: `, "")}`);
  });
  return { imported, skipped: 0, errors };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RedirectsSettings({ projectSlug, initialRedirects }: RedirectsSettingsProps) {
  // Core state
  const [redirects, setRedirects] = useState<Redirect[]>(initialRedirects);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  // List controls
  const [listSearch, setListSearch] = useState("");
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Selection
  const [selectedFroms, setSelectedFroms] = useState<Set<string>>(new Set());

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>("add");
  const [pendingDelete, setPendingDelete] = useState<Redirect[]>([]);

  // Add-redirect form
  const [newFrom, setNewFrom] = useState("");
  const [newTo, setNewTo] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ from?: string; to?: string }>({});
  const [docOptions, setDocOptions] = useState<DocOption[]>([]);
  const [docSearch, setDocSearch] = useState("");
  const [showDocPicker, setShowDocPicker] = useState(false);
  const docPickerRef = useRef<HTMLDivElement>(null);

  // Inline edit
  const [editingFrom, setEditingFrom] = useState<string | null>(null); // "from" key of row being edited
  const [editFrom, setEditFrom] = useState("");
  const [editTo, setEditTo] = useState("");
  const [editErrors, setEditErrors] = useState<{ from?: string; to?: string }>({});
  const [editSaving, setEditSaving] = useState(false);

  // Import form
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSkipped, setImportSkipped] = useState<string[]>([]);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [importPending, setImportPending] = useState<Redirect[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch published docs for the "To" combobox
  useEffect(() => {
    fetch(`/api/projects/${projectSlug}/documents`)
      .then((r) => r.json())
      .then((data) => {
        if (data.documents)
          setDocOptions(
            data.documents.map((d: { slug: string; title: string }) => ({
              slug: d.slug,
              title: d.title,
            }))
          );
      })
      .catch(() => {});
  }, [projectSlug]);

  // Close doc picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (docPickerRef.current && !docPickerRef.current.contains(e.target as Node))
        setShowDocPicker(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ---------------------------------------------------------------------------
  // List helpers
  // ---------------------------------------------------------------------------

  const filteredRedirects = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    if (!q) return redirects;
    return redirects.filter(
      (r) => r.from.toLowerCase().includes(q) || r.to.toLowerCase().includes(q)
    );
  }, [redirects, listSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredRedirects.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageItems = filteredRedirects.slice(pageStart, pageStart + pageSize);

  const filteredDocs = docOptions.filter(
    (d) =>
      d.title.toLowerCase().includes(docSearch.toLowerCase()) ||
      d.slug.toLowerCase().includes(docSearch.toLowerCase())
  );

  function removeRow(realIndex: number) {
    setPendingDelete([redirects[realIndex]]);
    setDialogMode("confirm-delete");
    setDialogOpen(true);
  }

  // Selection helpers
  const allPageFroms = pageItems.map((r) => r.from);
  const allFilteredFroms = filteredRedirects.map((r) => r.from);
  const pageAllSelected = allPageFroms.length > 0 && allPageFroms.every((f) => selectedFroms.has(f));
  const pagePartialSelected = !pageAllSelected && allPageFroms.some((f) => selectedFroms.has(f));

  function toggleRow(from: string) {
    setSelectedFroms((prev) => {
      const n = new Set(prev);
      n.has(from) ? n.delete(from) : n.add(from);
      return n;
    });
  }

  function togglePageAll() {
    if (pageAllSelected) {
      setSelectedFroms((prev) => {
        const n = new Set(prev);
        allPageFroms.forEach((f) => n.delete(f));
        return n;
      });
    } else {
      setSelectedFroms((prev) => new Set([...prev, ...allPageFroms]));
    }
  }

  function selectAll() {
    setSelectedFroms(new Set(allFilteredFroms));
  }

  function clearSelection() {
    setSelectedFroms(new Set());
  }

  function deleteSelected() {
    setPendingDelete(redirects.filter((r) => selectedFroms.has(r.from)));
    setDialogMode("confirm-delete");
    setDialogOpen(true);
  }

  async function confirmDelete() {
    const toDelete = new Set(pendingDelete.map((r) => r.from));
    const updated = redirects.filter((r) => !toDelete.has(r.from));

    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/projects/${projectSlug}/redirects`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirects: updated }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || "Failed to delete redirects");
        return;
      }
      setRedirects(updated);
      setSelectedFroms((prev) => { const n = new Set(prev); toDelete.forEach((f) => n.delete(f)); return n; });
      if (pendingDelete.length === 1 && pageItems.length === 1 && safePage > 1) setCurrentPage((p) => p - 1);
      setPendingDelete([]);
      setDialogOpen(false);
      setDeleteSuccess(true);
      setTimeout(() => setDeleteSuccess(false), 3000);
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Inline edit handlers
  // ---------------------------------------------------------------------------

  function startEdit(r: Redirect) {
    setEditingFrom(r.from);
    setEditFrom(r.from);
    setEditTo(r.to);
    setEditErrors({});
  }

  function cancelEdit() {
    setEditingFrom(null);
    setEditErrors({});
  }

  async function saveEdit(originalFrom: string) {
    const from = editFrom.trim();
    const to = editTo.trim();
    const errs: { from?: string; to?: string } = {};
    if (!from) errs.from = "Required";
    else if (!from.startsWith("/")) errs.from = 'Must start with "/"';
    if (!to) errs.to = "Required";
    else if (!to.startsWith("/")) errs.to = 'Must start with "/"';
    if (Object.keys(errs).length > 0) { setEditErrors(errs); return; }

    // Build updated list: replace original entry (upsert if from key changed)
    let updated: Redirect[];
    if (from === originalFrom) {
      updated = redirects.map((r) => r.from === originalFrom ? { from, to } : r);
    } else {
      // from path changed — remove old, upsert at same position
      updated = redirects.map((r) => r.from === originalFrom ? { from, to } : r);
      // If new from already exists elsewhere, remove that duplicate (last write wins)
      const seen = new Map<string, string>();
      for (const r of updated) seen.set(r.from, r.to);
      updated = Array.from(seen.entries()).map(([f, t]) => ({ from: f, to: t }));
    }

    setEditSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectSlug}/redirects`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirects: updated }),
      });
      if (!res.ok) { setEditErrors({ from: "Failed to save. Please try again." }); return; }
      setRedirects(updated);
      setEditingFrom(null);
    } catch {
      setEditErrors({ from: "Network error. Please try again." });
    } finally {
      setEditSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Dialog open helpers
  // ---------------------------------------------------------------------------

  function openAdd() {
    setNewFrom("");
    setNewTo("");
    setDocSearch("");
    setFieldErrors({});
    setDialogMode("add");
    setDialogOpen(true);
  }

  function openImport() {
    setImportErrors([]);
    setImportSkipped([]);
    setImportSummary(null);
    setImportPending([]);
    setDialogMode("import");
    setDialogOpen(true);
  }

  // ---------------------------------------------------------------------------
  // Add redirect
  // ---------------------------------------------------------------------------

  function validateNewRow(): boolean {
    const errs: { from?: string; to?: string } = {};
    if (!newFrom.trim()) errs.from = "Required";
    else if (!newFrom.startsWith("/")) errs.from = 'Must start with "/"';
    if (!newTo.trim()) errs.to = "Required";
    else if (!newTo.startsWith("/")) errs.to = 'Must start with "/"';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleAdd() {
    if (!validateNewRow()) return;
    const from = newFrom.trim();
    const to = newTo.trim();
    // Upsert: update existing entry if "from" already exists, otherwise append
    const updated = redirects.some((r) => r.from === from)
      ? redirects.map((r) => r.from === from ? { from, to } : r)
      : [...redirects, { from, to }];

    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/projects/${projectSlug}/redirects`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirects: updated }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || "Failed to save redirect");
        return;
      }
      setRedirects(updated);
      setDialogOpen(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Import
  // ---------------------------------------------------------------------------

  function handleFilePick(file: File) {
    setImportErrors([]);
    setImportSkipped([]);
    setImportSummary(null);
    setImportPending([]);

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "json" && ext !== "csv") {
      setImportErrors([
        `Unsupported file type ".${ext ?? "unknown"}". Only .json and .csv files are accepted.`,
      ]);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = ext === "json" ? parseJsonFile(text) : parseCsvFile(text);

      if (result.errors.length > 0 && result.imported.length === 0) {
        setImportErrors(result.errors);
        return;
      }

      // Merge: deduplicate within the file itself (last wins), track new vs updated
      const existingFroms = new Set(redirects.map((r) => r.from));
      const seenInFile = new Map<string, string>();
      for (const r of result.imported) seenInFile.set(r.from, r.to);
      const fileEntries = Array.from(seenInFile.entries()).map(([from, to]) => ({ from, to }));

      const newEntries = fileEntries.filter((r) => !existingFroms.has(r.from));
      const updatedEntries = fileEntries.filter((r) => existingFroms.has(r.from));

      setImportPending(fileEntries);
      setImportSkipped(updatedEntries.map((r) => r.from));

      const parts: string[] = [];
      if (newEntries.length > 0) parts.push(`${newEntries.length} new`);

      if (result.errors.length > 0) parts.push(`${result.errors.length} row${result.errors.length !== 1 ? "s" : ""} had errors`);
      setImportSummary(parts.join(" · "));
      if (result.errors.length > 0) setImportErrors(result.errors);
    };
    reader.readAsText(file);
  }

  async function confirmImport() {
    const merged = [...redirects, ...importPending];

    // Deduplicate by "from" (same logic as the API, last write wins)
    const seen = new Map<string, string>();
    for (const r of merged) seen.set(r.from, r.to);
    const deduped = Array.from(seen.entries()).map(([from, to]) => ({ from, to }));

    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/projects/${projectSlug}/redirects`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirects: deduped }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || "Failed to save redirects");
        return;
      }
      setRedirects(deduped);
      setDialogOpen(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const res = await fetch(`/api/projects/${projectSlug}/redirects`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirects }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || "Failed to save redirects");
      } else {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={openImport}>
            <FileJson className="h-4 w-4 mr-1.5" />
            Import JSON / CSV
          </Button>
        </div>

        <div className="flex items-center gap-2 text-sm">
          {saving && <span className="text-gray-400">Saving…</span>}
          {saveError && <span className="text-red-500">{saveError}</span>}
          {saveSuccess && <span className="text-green-600">Saved successfully.</span>}
          {deleteSuccess && <span className="text-green-600">Deleted successfully.</span>}
        </div>
      </div>

      {/* List controls */}
      {redirects.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Search by path…"
              value={listSearch}
              onChange={(e) => { setListSearch(e.target.value); setCurrentPage(1); }}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500 shrink-0">
            <span>Show</span>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => { setPageSize(n); setCurrentPage(1); }}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  pageSize === n ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {n}
              </button>
            ))}
            <span className="text-gray-400 text-xs">
              {filteredRedirects.length} total
              {listSearch && ` (filtered from ${redirects.length})`}
            </span>
          </div>
        </div>
      )}

      {/* Redirects table */}
      {redirects.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-lg py-12 text-center text-sm text-gray-400">
          No redirects configured yet.{" "}
          <button className="text-blue-600 hover:underline" onClick={openAdd}>Add one</button>{" "}
          or{" "}
          <button className="text-blue-600 hover:underline" onClick={openImport}>import a file</button>.
        </div>
      ) : filteredRedirects.length === 0 ? (
        <div className="border rounded-md py-8 text-center text-sm text-gray-400">
          No redirects match <span className="font-mono">&quot;{listSearch}&quot;</span>.
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          {/* Bulk action bar — inline, doesn't shift the header */}
          {selectedFroms.size > 0 && (
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-1.5 flex items-center gap-2 text-xs text-gray-500">
              <span className="font-medium text-gray-700">{selectedFroms.size} selected</span>
              {selectedFroms.size < allFilteredFroms.length && (
                <>
                  <span className="text-gray-300">·</span>
                  <button onClick={selectAll} className="text-blue-600 hover:underline">
                    Select all {allFilteredFroms.length}
                  </button>
                </>
              )}
              <span className="text-gray-300">·</span>
              <button onClick={clearSelection} className="hover:text-gray-700">Clear</button>
              <div className="ml-auto">
                <button
                  onClick={deleteSelected}
                  className="flex items-center gap-1 text-red-500 hover:text-red-700 font-medium"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete {selectedFroms.size}
                </button>
              </div>
            </div>
          )}

          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={pageAllSelected}
                    ref={(el) => { if (el) el.indeterminate = pagePartialSelected; }}
                    onChange={togglePageAll}
                    className="rounded border-gray-300 text-blue-600 cursor-pointer"
                    title={pageAllSelected ? "Deselect page" : "Select page"}
                  />
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-1/2">From (old path)</th>
                <th className="w-6"></th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-1/2">To (new path)</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pageItems.map((r) => {
                const realIndex = redirects.indexOf(r);
                const isSelected = selectedFroms.has(r.from);
                return (
                  <tr
                    key={realIndex}
                    className={`transition-colors ${isSelected ? "bg-blue-50" : "bg-white hover:bg-gray-50"}`}
                  >
                    {editingFrom === r.from ? (
                      /* ── Inline edit row ── */
                      <td colSpan={5} className="px-3 py-2">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <input
                              autoFocus
                              value={editFrom}
                              onChange={(e) => setEditFrom(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") saveEdit(r.from); if (e.key === "Escape") cancelEdit(); }}
                              className={`w-full font-mono text-xs px-2 py-1 border rounded focus:outline-none focus:ring-1 ${editErrors.from ? "border-red-400 focus:ring-red-400" : "border-gray-300 focus:ring-blue-400"}`}
                              placeholder="/from-path"
                            />
                            {editErrors.from && <p className="text-[10px] text-red-500 mt-0.5">{editErrors.from}</p>}
                          </div>
                          <ArrowRight className="h-3 w-3 text-gray-300 mt-2 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <input
                              value={editTo}
                              onChange={(e) => setEditTo(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") saveEdit(r.from); if (e.key === "Escape") cancelEdit(); }}
                              className={`w-full font-mono text-xs px-2 py-1 border rounded focus:outline-none focus:ring-1 ${editErrors.to ? "border-red-400 focus:ring-red-400" : "border-gray-300 focus:ring-blue-400"}`}
                              placeholder="/to-path"
                            />
                            {editErrors.to && <p className="text-[10px] text-red-500 mt-0.5">{editErrors.to}</p>}
                          </div>
                          <div className="flex gap-1 mt-0.5 shrink-0">
                            <button
                              onClick={() => saveEdit(r.from)}
                              disabled={editSaving}
                              className="text-green-600 hover:text-green-700 disabled:opacity-50"
                              title="Save"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={editSaving}
                              className="text-gray-400 hover:text-gray-600"
                              title="Cancel"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRow(r.from)}
                            className="rounded border-gray-300 text-blue-600 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-700 truncate max-w-xs">{r.from}</td>
                        <td className="text-gray-300 text-center"><ArrowRight className="h-3 w-3 mx-auto" /></td>
                        <td className="px-4 py-2 font-mono text-xs text-blue-700 truncate max-w-xs">{r.to}</td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => startEdit(r)}
                              className="text-gray-400 hover:text-blue-500 transition-colors"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => removeRow(realIndex)}
                              className="text-gray-400 hover:text-red-500 transition-colors"
                              title="Remove"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="border-t bg-gray-50 px-4 py-2 flex items-center justify-between text-sm text-gray-600">
              <span className="text-xs">
                Showing {pageStart + 1}–{Math.min(pageStart + pageSize, filteredRedirects.length)} of {filteredRedirects.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="p-1 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((n) => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
                  .reduce<(number | "…")[]>((acc, n, idx, arr) => {
                    if (idx > 0 && (n as number) - (arr[idx - 1] as number) > 1) acc.push("…");
                    acc.push(n);
                    return acc;
                  }, [])
                  .map((item, i) =>
                    item === "…" ? (
                      <span key={`e${i}`} className="px-1 text-gray-400 text-xs">…</span>
                    ) : (
                      <button
                        key={item}
                        onClick={() => setCurrentPage(item as number)}
                        className={`min-w-[28px] h-7 rounded text-xs font-medium transition-colors ${
                          safePage === item ? "bg-blue-600 text-white" : "hover:bg-gray-200 text-gray-600"
                        }`}
                      >
                        {item}
                      </button>
                    )
                  )}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="p-1 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Dialog                                                              */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl">

          {/* ---------- ADD REDIRECT ---------- */}
          {dialogMode === "add" && (
            <>
              <DialogHeader>
                <DialogTitle>Add Redirect</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* From */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">From path <span className="text-red-500">*</span></label>
                  <Input
                    placeholder="/docs/old-page-slug/"
                    value={newFrom}
                    onChange={(e) => setNewFrom(e.target.value)}
                    className={fieldErrors.from ? "border-red-400" : ""}
                    autoFocus
                  />
                  {fieldErrors.from && <p className="text-xs text-red-500">{fieldErrors.from}</p>}
                  <p className="text-xs text-gray-400">The old URL path visitors currently land on.</p>
                </div>

                {/* To */}
                <div className="space-y-1.5" ref={docPickerRef}>
                  <label className="text-sm font-medium text-gray-700">To path <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Input
                      placeholder="/section/doc-slug or type a path"
                      value={newTo}
                      onChange={(e) => { setNewTo(e.target.value); setDocSearch(e.target.value); }}
                      onFocus={() => setShowDocPicker(true)}
                      className={fieldErrors.to ? "border-red-400" : ""}
                    />
                    {showDocPicker && docOptions.length > 0 && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-52 overflow-y-auto">
                        <div className="sticky top-0 bg-white border-b px-3 py-2 flex items-center gap-2">
                          <Search className="h-3 w-3 text-gray-400 shrink-0" />
                          <input
                            className="text-xs outline-none w-full placeholder-gray-400"
                            placeholder="Search published docs…"
                            value={docSearch}
                            onChange={(e) => setDocSearch(e.target.value)}
                          />
                        </div>
                        {filteredDocs.length === 0 ? (
                          <p className="text-xs text-gray-400 px-3 py-2">No docs found</p>
                        ) : (
                          filteredDocs.map((d) => (
                            <button
                              key={d.slug}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setNewTo(`/${d.slug}`);
                                setDocSearch("");
                                setShowDocPicker(false);
                              }}
                            >
                              <span className="font-medium text-gray-800">{d.title}</span>
                              <span className="ml-2 text-xs text-gray-400 font-mono">/{d.slug}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {fieldErrors.to && <p className="text-xs text-red-500">{fieldErrors.to}</p>}
                  <p className="text-xs text-gray-400">Where the visitor should land. Pick a doc or type a custom path.</p>
                </div>
              </div>

              <DialogFooter showCloseButton>
                <Button onClick={handleAdd} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ---------- IMPORT ---------- */}
          {dialogMode === "import" && (
            <>
              <DialogHeader>
                <DialogTitle>Import Redirects</DialogTitle>
              </DialogHeader>

              <div className="space-y-3 py-1">
                {/* Format reference — compact inline */}
                <div className="grid grid-cols-2 gap-2">
                  {/* JSON */}
                  <div className="rounded border border-gray-200 overflow-hidden text-xs">
                    <div className="bg-gray-100 border-b border-gray-200 px-2 py-1 flex items-center justify-between">
                      <span className="font-semibold text-gray-600 tracking-wide uppercase text-[10px]">JSON</span>
                      <span className="text-gray-400 font-mono text-[10px]">.json</span>
                    </div>
                    <pre className="bg-[#1e1e2e] text-[#cdd6f4] px-3 py-2 overflow-x-auto leading-4 text-[10px]">{`[{ `}<span className="text-[#89b4fa]">"from"</span>{`: `}<span className="text-[#a6e3a1]">"/old"</span>{`, `}<span className="text-[#89b4fa]">"to"</span>{`: `}<span className="text-[#a6e3a1]">"/new"</span>{` }]`}</pre>
                  </div>
                  {/* CSV */}
                  <div className="rounded border border-gray-200 overflow-hidden text-xs">
                    <div className="bg-gray-100 border-b border-gray-200 px-2 py-1 flex items-center justify-between">
                      <span className="font-semibold text-gray-600 tracking-wide uppercase text-[10px]">CSV</span>
                      <span className="text-gray-400 font-mono text-[10px]">.csv</span>
                    </div>
                    <pre className="bg-[#1e1e2e] text-[#cdd6f4] px-3 py-2 overflow-x-auto leading-4 text-[10px]"><span className="text-[#89dceb]">from</span>{`,`}<span className="text-[#89dceb]">to</span>{`\n`}<span className="text-[#a6e3a1]">/old</span>{`,`}<span className="text-[#a6e3a1]">/new</span></pre>
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  Both <code className="bg-gray-100 border border-gray-200 px-1 py-0.5 rounded text-gray-600">from</code> and <code className="bg-gray-100 border border-gray-200 px-1 py-0.5 rounded text-gray-600">to</code> must start with <code className="bg-gray-100 border border-gray-200 px-1 py-0.5 rounded text-gray-600">/</code>.
                </p>

                {/* File drop zone — smaller */}
                <div
                  className="border-2 border-dashed border-gray-200 rounded-lg py-4 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) handleFilePick(file);
                  }}
                >
                  <Upload className="h-5 w-5 mx-auto text-gray-300 mb-1" />
                  <p className="text-xs text-gray-500">
                    <span className="text-blue-600 font-medium">Click to browse</span> or drag &amp; drop
                    <span className="text-gray-400 ml-1">· .json or .csv only</span>
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFilePick(file);
                      e.target.value = "";
                    }}
                  />
                </div>

                {/* Feedback */}
                {importSummary && (
                  <div className={`border rounded px-3 py-1.5 text-xs font-medium ${
                    importErrors.length > 0
                      ? "bg-yellow-50 border-yellow-200 text-yellow-800"
                      : "bg-green-50 border-green-200 text-green-700"
                  }`}>
                    {importSummary}
                  </div>
                )}

                {/* Will update existing */}
                {importSkipped.length > 0 && (
                  <div className="border border-amber-200 rounded overflow-hidden">
                    <div className="bg-amber-50 px-3 py-1.5 border-b">
                      <p className="text-xs font-medium text-amber-700">
                        Detected {importSkipped.length} existing — destination will be replaced on import
                      </p>
                    </div>
                    <ul className="h-24 overflow-y-auto divide-y">
                      {importSkipped.map((from, i) => (
                        <li key={i} className="px-3 py-1 font-mono text-xs text-amber-800 bg-white">
                          {from}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Validation errors */}
                {importErrors.length > 0 && (
                  <div className="border border-red-200 rounded overflow-hidden">
                    <div className="bg-red-50 px-3 py-1.5 border-b">
                      <p className="text-xs font-medium text-red-700">
                        Validation errors ({importErrors.length})
                      </p>
                    </div>
                    <ul className="h-20 overflow-y-auto divide-y">
                      {importErrors.map((err, i) => (
                        <li key={i} className="px-3 py-1 font-mono text-xs text-red-600 bg-white">
                          {err}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <DialogFooter showCloseButton>
                <Button
                  onClick={confirmImport}
                  disabled={importPending.length === 0 || saving}
                >
                  <Upload className="h-4 w-4 mr-1.5" />
                  {saving
                    ? "Saving…"
                    : importPending.length > 0
                      ? `Import & Save ${importPending.length} redirect${importPending.length !== 1 ? "s" : ""}`
                      : "Import & Save"}
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ---------- CONFIRM DELETE ---------- */}
          {dialogMode === "confirm-delete" && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {pendingDelete.length === 1 ? "Delete redirect?" : `Delete ${pendingDelete.length} redirects?`}
                </DialogTitle>
              </DialogHeader>

              <div className="py-2 space-y-3">
                <p className="text-sm text-gray-600">
                  {pendingDelete.length === 1
                    ? "This redirect will be permanently removed."
                    : `These ${pendingDelete.length} redirects will be permanently removed.`}{" "}
                  This action cannot be undone.
                </p>

                <div className="border rounded-md overflow-hidden">
                  <ul className={`divide-y ${pendingDelete.length > 6 ? "max-h-52 overflow-y-auto" : ""}`}>
                    {pendingDelete.map((r, i) => (
                      <li key={i} className="px-3 py-2 flex items-center gap-2 bg-white text-xs font-mono group">
                        <span className="text-gray-600 truncate flex-1 min-w-0">{r.from}</span>
                        <ArrowRight className="h-3 w-3 text-gray-300 shrink-0" />
                        <span className="text-blue-600 truncate flex-1 min-w-0">{r.to}</span>
                        {pendingDelete.length > 1 && (
                          <button
                            title="Remove from selection"
                            onClick={() => {
                            setPendingDelete((prev) => prev.filter((_, j) => j !== i));
                            setSelectedFroms((prev) => { const n = new Set(prev); n.delete(r.from); return n; });
                          }}
                            className="ml-1 shrink-0 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
                {pendingDelete.length > 1 && (
                  <p className="text-xs text-gray-400">Hover a row and click × to remove it from this selection without deleting it.</p>
                )}
              </div>

              <DialogFooter showCloseButton>
                <Button variant="outline" onClick={() => { setPendingDelete([]); setDialogOpen(false); }}>
                  Cancel
                </Button>
                <Button
                  onClick={confirmDelete}
                  disabled={pendingDelete.length === 0 || saving}
                  className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  {saving ? "Deleting…" : pendingDelete.length === 1 ? "Delete" : `Delete ${pendingDelete.length}`}
                </Button>
              </DialogFooter>
            </>
          )}

        </DialogContent>
      </Dialog>
    </div>
  );
}
