"use client";

import { FC, useState, useRef, useCallback, useEffect } from "react";
import {
  LinkToolbar,
  DeleteLinkButton,
  OpenLinkButton,
  useBlockNoteEditor,
} from "@blocknote/react";
import type { LinkToolbarProps } from "@blocknote/react";
import { FileText, Pencil } from "lucide-react";
import { useDocContext } from "@/contexts/DocContext";

const DOC_PREFIX = "doc:";

function isInternalHref(url: string) {
  return url.startsWith(DOC_PREFIX);
}

function extractSlug(url: string) {
  return url.slice(DOC_PREFIX.length);
}

interface DocSearchResult {
  id: string;
  title: string;
  slug: string;
  section?: string;
}

export const DocLinkToolbar: FC<LinkToolbarProps> = ({
  url,
  text,
  range,
  setToolbarOpen,
  setToolbarPositionFrozen,
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editor = useBlockNoteEditor() as any;
  const { projectSlug } = useDocContext();

  const isInternal = isInternalHref(url);
  const [editing, setEditing] = useState(!url);
  const [linkType, setLinkType] = useState<"external" | "internal">(
    isInternal ? "internal" : "external",
  );
  const [urlInput, setUrlInput] = useState(isInternal ? "" : url);
  const [searchQuery, setSearchQuery] = useState(
    isInternal ? extractSlug(url) : "",
  );
  const [docSlugInput, setDocSlugInput] = useState(
    isInternal ? extractSlug(url) : "",
  );
  const [searchResults, setSearchResults] = useState<DocSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreNextSearchRef = useRef(false);

  // Freeze toolbar position while edit form is open so focus changes don't dismiss it
  useEffect(() => {
    if (editing) setToolbarPositionFrozen?.(true);
  }, [editing, setToolbarPositionFrozen]);

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

  const selectDoc = useCallback(
    (result: DocSearchResult) => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      ignoreNextSearchRef.current = true;
      setDocSlugInput(result.slug);
      setSearchQuery(result.title);
      setShowDropdown(false);
    },
    [],
  );

  const commit = useCallback(() => {
    const href =
      linkType === "internal"
        ? `${DOC_PREFIX}${docSlugInput.trim()}`
        : urlInput.trim();
    if (!href || href === DOC_PREFIX) return;

    // Bypass setLink (which has isAllowedUri validation that rejects "doc:" hrefs).
    // view.dispatch is TipTap's dispatchTransaction override, so onUpdate fires
    // and BlockNote's editor.document is updated for persistence.
    const tiptap = editor?._tiptapEditor;
    if (!tiptap?.view || !range) {
      // Range can be stale/undefined or the editor view momentarily unavailable —
      // fail safe instead of throwing.
      setEditing(false);
      setToolbarPositionFrozen?.(false);
      setToolbarOpen?.(false);
      return;
    }
    const linkMarkType = tiptap.schema.marks.link;
    if (!linkMarkType) return;
    const { from, to } = range;
    try {
      tiptap.view.dispatch(
        tiptap.state.tr
          .removeMark(from, to, linkMarkType)
          .addMark(from, to, linkMarkType.create({ href })),
      );
    } catch (e) {
      console.error("[link] apply failed", e);
    }
    setEditing(false);
    setToolbarPositionFrozen?.(false);
    setToolbarOpen?.(false);
  }, [linkType, docSlugInput, urlInput, editor, range, setToolbarPositionFrozen, setToolbarOpen]);

  const openEditForm = useCallback(() => {
    setEditing(true);
    // setToolbarPositionFrozen is called by the useEffect above when editing→true
  }, []);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setShowDropdown(false);
    setToolbarPositionFrozen?.(false);
    if (!url) setToolbarOpen?.(false);
  }, [url, setToolbarPositionFrozen, setToolbarOpen]);

  // ── View state ──────────────────────────────────────────────────────────────
  if (!editing) {
    return (
      <LinkToolbar
        url={url}
        text={text}
        range={range}
        setToolbarOpen={setToolbarOpen}
        setToolbarPositionFrozen={setToolbarPositionFrozen}
      >
        {/* Link label */}
        <span className="flex items-center gap-1 text-xs text-gray-600 max-w-[180px] truncate px-1">
          {isInternal ? (
            <FileText size={11} className="text-green-600 shrink-0" />
          ) : null}
          <span className="truncate">
            {isInternal ? extractSlug(url) : url}
          </span>
        </span>

        {/* Default open-in-new-tab button for external links only */}
        {!isInternal && <OpenLinkButton url={url} />}

        {/* Edit button */}
        <button
          className="bn-button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={openEditForm}
          title="Edit link"
        >
          <Pencil size={13} />
        </button>

        {/* Delete */}
        <DeleteLinkButton range={range} setToolbarOpen={setToolbarOpen} />
      </LinkToolbar>
    );
  }

  // ── Edit state ───────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col gap-2 p-3 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[280px]"
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

      {/* URL input or doc search */}
      {linkType === "external" ? (
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancelEdit();
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
              if (e.key === "Escape") {
                setShowDropdown(false);
                cancelEdit();
              }
            }}
            placeholder="Search for a document…"
            className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 outline-none focus:border-green-400 focus:ring-1 focus:ring-green-100"
          />
          {isSearching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
              Searching…
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
                  <div className="font-medium text-gray-800 truncate">
                    {result.title}
                  </div>
                  {result.section && (
                    <div className="text-xs text-gray-400 truncate">
                      {result.section}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
          {showDropdown &&
            !isSearching &&
            searchResults.length === 0 &&
            searchQuery.trim() && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-sm px-3 py-2 text-sm text-gray-500">
                No documents found
              </div>
            )}
        </div>
      )}

      {/* Selected doc confirmation — shown after picking a result from the dropdown */}
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
          disabled={
            linkType === "external" ? !urlInput.trim() : !docSlugInput.trim()
          }
          className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          Apply
        </button>
        {url && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={cancelEdit}
            className="px-3 py-1 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};
