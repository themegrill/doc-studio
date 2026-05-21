"use client";

import { FC, useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  useBlockNoteEditor,
  useEditorState,
} from "@blocknote/react";
import { FileText, Link2, Loader2 } from "lucide-react";
import { useDocContext } from "@/contexts/DocContext";

const DOC_PREFIX = "doc:";

interface DocSearchResult {
  id: string;
  title: string;
  slug: string;
  section?: string;
}

export const DocCreateLinkButton: FC = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editor = useBlockNoteEditor() as any;
  const { projectSlug } = useDocContext();
  const [open, setOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [linkType, setLinkType] = useState<"external" | "internal">("external");
  const [urlInput, setUrlInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [docSlugInput, setDocSlugInput] = useState("");
  const [searchResults, setSearchResults] = useState<DocSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreNextSearchRef = useRef(false);
  const savedRangeRef = useRef<{ from: number; to: number } | null>(null);

  // Track editor selection state — same logic as BlockNote's built-in CreateLinkButton
  const selectionState = useEditorState({
    editor,
    selector: ({ editor: e }: { editor: typeof editor }) => {
      const sel = e.prosemirrorState?.selection;
      if (!e.isEditable || !sel) return undefined;
      const text = e.getSelectedText?.() ?? "";
      if (!text) return undefined;
      const existingUrl = e.getSelectedLinkUrl?.() ?? "";
      return {
        url: existingUrl,
        text,
        range: { from: sel.from, to: sel.to },
      };
    },
  });

  const calcPos = useCallback((): { top: number; left: number } => {
    // Position the popover below the formatting toolbar when possible,
    // falling back to below the current text selection.
    const toolbar = document.querySelector(".bn-formatting-toolbar");
    if (toolbar) {
      const rect = toolbar.getBoundingClientRect();
      return { top: rect.bottom + 4, left: rect.left };
    }
    try {
      const view = editor._tiptapEditor.view;
      const sel = editor.prosemirrorState?.selection;
      const coords = sel ? view.coordsAtPos(sel.from) : null;
      if (coords) return { top: coords.bottom + 8, left: coords.left };
    } catch { /* ignore */ }
    return { top: 200, left: 400 };
  }, [editor]);

  // Pre-fill inputs when opening for an existing link
  useEffect(() => {
    if (!open) return;
    const url = selectionState?.url ?? "";
    if (url.startsWith(DOC_PREFIX)) {
      setLinkType("internal");
      const slug = url.slice(DOC_PREFIX.length);
      setDocSlugInput(slug);
      setSearchQuery(slug);
    } else {
      setLinkType("external");
      setUrlInput(url);
      setDocSlugInput("");
      setSearchQuery("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Ctrl+K inside the editor opens this button's popover.
  // Always stop propagation so the global SearchDialog never fires when editing.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        e.stopPropagation();
        const state = editor.prosemirrorState?.selection;
        const text = editor.getSelectedText?.() ?? "";
        if (!text || !state) return;
        savedRangeRef.current = { from: state.from, to: state.to };
        setPopoverPos(calcPos());
        setOpen((prev) => !prev);
      }
    };
    const el = editor.domElement as HTMLElement | undefined;
    el?.addEventListener("keydown", handleKeyDown);
    return () => el?.removeEventListener("keydown", handleKeyDown);
  }, [editor, calcPos]);

  const runSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults([]);
        setShowDropdown(false);
        return;
      }
      setIsSearching(true);
      try {
        const params = new URLSearchParams({ q: query });
        if (projectSlug) params.set("projectSlug", projectSlug);
        const res = await fetch(`/api/search?${params}`);
        const data = await res.json();
        if (!ignoreNextSearchRef.current) {
          setSearchResults(data.results || []);
          setShowDropdown(true);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [projectSlug],
  );

  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchQuery(query);
      setDocSlugInput("");
      ignoreNextSearchRef.current = false;
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => runSearch(query), 300);
    },
    [runSearch],
  );

  const selectDoc = useCallback((result: DocSearchResult) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    ignoreNextSearchRef.current = true;
    setDocSlugInput(result.slug);
    setSearchQuery(result.title);
    setShowDropdown(false);
  }, []);

  const resetForm = useCallback(() => {
    setUrlInput("");
    setSearchQuery("");
    setDocSlugInput("");
    setSearchResults([]);
    setShowDropdown(false);
    setLinkType("external");
    savedRangeRef.current = null;
    ignoreNextSearchRef.current = false;
  }, []);

  const commit = useCallback(() => {
    const href =
      linkType === "internal"
        ? `${DOC_PREFIX}${docSlugInput.trim()}`
        : urlInput.trim();
    if (!href || href === DOC_PREFIX) return;

    const range = savedRangeRef.current;
    if (!range) return;

    const { from, to } = range;
    const tiptap = editor._tiptapEditor;

    // Bypass TipTap's command runner (which has a `!view.editable` guard that
    // silently returns false) and call view.dispatch directly.  view.dispatch IS
    // TipTap's dispatchTransaction override, so onUpdate fires and BlockNote's
    // editor.document is updated for persistence.  Using addMark on the raw
    // transaction also avoids setLink's isAllowedUri check that rejects "doc:".
    const linkMarkType = tiptap.schema.marks.link;
    if (!linkMarkType) return;
    tiptap.view.dispatch(
      tiptap.state.tr.addMark(from, to, linkMarkType.create({ href })),
    );

    setOpen(false);
    resetForm();
  }, [linkType, docSlugInput, urlInput, editor, resetForm]);

  const handleOpen = useCallback(() => {
    const state = editor.prosemirrorState?.selection;
    if (state) savedRangeRef.current = { from: state.from, to: state.to };
    setPopoverPos(calcPos());
    setOpen((prev) => !prev);
  }, [editor, calcPos]);

  // Hide the button when there's no text selection — but keep the portal mounted
  // while the popup is open so the user can finish typing the URL.
  if (!selectionState && !open) return null;

  return (
    <>
      {selectionState && (
        <button
          className="bn-button"
          title="Create link"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleOpen}
        >
          <Link2 size={14} />
        </button>
      )}

      {open && typeof document !== "undefined" && createPortal(
        <>
          {/* Backdrop — outside toolbar transform context */}
          <div
            className="fixed inset-0 z-[9998]"
            onMouseDown={() => { setOpen(false); resetForm(); }}
          />
          {/* Popover — portal to document.body so position:fixed is viewport-relative */}
          <div
            className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg min-w-[280px] p-3 flex flex-col gap-2"
            style={{ top: popoverPos.top, left: popoverPos.left }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* External / Internal toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded p-0.5 w-fit">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setLinkType("external")}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  linkType === "external"
                    ? "bg-white text-blue-700 font-medium shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                External URL
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setLinkType("internal")}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  linkType === "internal"
                    ? "bg-white text-green-700 font-medium shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Internal Doc
              </button>
            </div>

            {linkType === "external" ? (
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") { setOpen(false); resetForm(); }
                }}
                placeholder="https://example.com"
                className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
              />
            ) : (
              <div className="relative">
                <input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { setShowDropdown(false); setOpen(false); resetForm(); }
                  }}
                  placeholder="Search for a document…"
                  className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 outline-none focus:border-green-400 focus:ring-1 focus:ring-green-100"
                />
                {isSearching && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 size={13} className="animate-spin text-gray-400" />
                  </span>
                )}
                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {searchResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectDoc(result)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                      >
                        <div className="font-medium text-gray-800 truncate flex items-center gap-1.5">
                          <FileText size={12} className="text-green-600 shrink-0" />
                          {result.title}
                        </div>
                        {result.section && (
                          <div className="text-xs text-gray-400 truncate ml-4">
                            {result.section}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {showDropdown && !isSearching && searchResults.length === 0 && searchQuery.trim() && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-sm px-3 py-2 text-sm text-gray-500">
                    No documents found
                  </div>
                )}
              </div>
            )}

            {/* Selected doc confirmation — only shown once a result has been picked */}
            {linkType === "internal" && docSlugInput && !showDropdown && (
              <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
                <FileText size={11} className="shrink-0" />
                <span className="truncate" title={docSlugInput}>{searchQuery || docSlugInput}</span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={commit}
                disabled={linkType === "external" ? !urlInput.trim() : !docSlugInput.trim()}
                className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                Apply
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setOpen(false); resetForm(); }}
                className="px-3 py-1 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
};
