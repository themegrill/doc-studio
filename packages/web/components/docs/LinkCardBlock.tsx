"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { Link, ExternalLink, X, FileText, ArrowRight } from "lucide-react";
import NextLink from "next/link";
import { useDocContext } from "@/contexts/DocContext";

interface DocSearchResult {
  id: string;
  title: string;
  slug: string;
  description?: string;
  section?: string;
}

type LinkCardBlockProps = {
  block: {
    id: string;
    type: "linkCard";
    props: { url: string; label: string; linkType: string; docSlug: string; cachedTitle: string };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any;
};

function LinkCardBlockContent({ block, editor }: LinkCardBlockProps) {
  const { projectSlug } = useDocContext();

  const resolvedLinkType = (block.props.linkType as "external" | "internal") || "external";
  const isInternal = resolvedLinkType === "internal";
  const hasLink = isInternal ? !!block.props.docSlug : !!block.props.url;

  const [editing, setEditing] = useState(false);
  const [linkType, setLinkType] = useState<"external" | "internal">(resolvedLinkType);
  const [urlInput, setUrlInput] = useState(block.props.url);
  const [labelInput, setLabelInput] = useState(block.props.label);
  const [docSlugInput, setDocSlugInput] = useState(block.props.docSlug);
  const [searchQuery, setSearchQuery] = useState(block.props.cachedTitle || block.props.docSlug || "");
  const [searchResults, setSearchResults] = useState<DocSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedDocTitle, setSelectedDocTitle] = useState(block.props.cachedTitle || "");

  const urlRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (editing) {
      if (linkType === "external") urlRef.current?.focus();
      else searchRef.current?.focus();
    }
  }, [editing, linkType]);

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
        setSearchResults(data.results || []);
        setShowDropdown(true);
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
      // Clear selected slug if user edits the query manually
      if (query !== selectedDocTitle) setDocSlugInput("");
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => runSearch(query), 300);
    },
    [runSearch, selectedDocTitle],
  );

  const selectDoc = useCallback((doc: DocSearchResult) => {
    setDocSlugInput(doc.slug);
    setSearchQuery(doc.title);
    setSelectedDocTitle(doc.title);
    setShowDropdown(false);
  }, []);

  const commit = useCallback(() => {
    if (linkType === "external") {
      const trimmedUrl = urlInput.trim();
      if (!trimmedUrl) return;
      editor.updateBlock(block, {
        props: { url: trimmedUrl, label: labelInput.trim(), linkType: "external", docSlug: "" },
      });
    } else {
      const trimmedSlug = docSlugInput.trim();
      if (!trimmedSlug) return;
      editor.updateBlock(block, {
        props: {
          url: "",
          label: labelInput.trim(),
          linkType: "internal",
          docSlug: trimmedSlug,
          cachedTitle: selectedDocTitle,
        },
      });
    }
    setEditing(false);
  }, [urlInput, labelInput, linkType, docSlugInput, block, editor]);

  const cancel = useCallback(() => {
    setUrlInput(block.props.url);
    setLabelInput(block.props.label);
    const type = (block.props.linkType as "external" | "internal") || "external";
    setLinkType(type);
    setDocSlugInput(block.props.docSlug);
    setSearchQuery(block.props.cachedTitle || block.props.docSlug || "");
    setShowDropdown(false);
    setEditing(false);
  }, [block.props]);

  const clear = useCallback(() => {
    editor.updateBlock(block, {
      props: { url: "", label: "", linkType: "external", docSlug: "", cachedTitle: "" },
    });
    setUrlInput("");
    setLabelInput("");
    setLinkType("external");
    setDocSlugInput("");
    setSearchQuery("");
    setSelectedDocTitle("");
  }, [block, editor]);

  const { url, label, docSlug, cachedTitle } = block.props;
  const displayLabel = label || (isInternal ? (cachedTitle || docSlug) : url);

  const internalHref =
    isInternal && docSlug
      ? projectSlug
        ? `/projects/${projectSlug}/docs/${docSlug}`
        : `/docs/${docSlug}`
      : null;

  // View mode (read-only)
  if (!editor.isEditable) {
    if (!hasLink) return null;
    if (isInternal && internalHref) {
      return (
        <div className="my-1 not-prose" contentEditable={false}>
          <NextLink
            href={internalHref}
            className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors group no-underline"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-green-50 shrink-0">
              <FileText size={15} className="text-green-600" />
            </div>
            <span className="flex-1 text-sm font-medium text-gray-800 truncate">
              {displayLabel}
            </span>
            <ArrowRight
              size={14}
              className="text-gray-400 group-hover:text-green-600 shrink-0 transition-colors"
            />
          </NextLink>
        </div>
      );
    }
    return (
      <div className="my-1 not-prose" contentEditable={false}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors group no-underline"
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-blue-50 shrink-0">
            <Link size={15} className="text-blue-500" />
          </div>
          <span className="flex-1 text-sm font-medium text-gray-800 truncate">
            {displayLabel}
          </span>
          <ExternalLink
            size={14}
            className="text-gray-400 group-hover:text-blue-500 shrink-0 transition-colors"
          />
        </a>
      </div>
    );
  }

  // Edit mode — inline edit form (shown when editing=true or no link set yet)
  if (editing || !hasLink) {
    return (
      <div contentEditable={false} className="my-1 w-full">
        <div className="border border-blue-200 rounded-lg p-3 bg-white space-y-2 shadow-sm">
          {/* Header + type toggle */}
          <div className="flex items-center gap-2">
            <Link size={14} className="text-blue-400 shrink-0" />
            <span className="text-xs font-medium text-gray-600">Link Block</span>
            <div className="flex items-center gap-1 ml-1 bg-gray-100 rounded p-0.5">
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
                onClick={() => {
                  setLinkType("internal");
                  setTimeout(() => searchRef.current?.focus(), 0);
                }}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  linkType === "internal"
                    ? "bg-white text-green-700 font-medium shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Internal Doc
              </button>
            </div>
            {hasLink && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={cancel}
                className="ml-auto text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* URL input or doc picker */}
          {linkType === "external" ? (
            <input
              ref={urlRef}
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") cancel();
              }}
              placeholder="https://example.com"
              className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            />
          ) : (
            <div className="relative">
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setShowDropdown(false);
                    if (!hasLink) cancel();
                  }
                }}
                onFocus={() => {
                  if (searchQuery && searchResults.length > 0) setShowDropdown(true);
                }}
                placeholder="Search for a document..."
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
                      <div className="font-medium text-gray-800 truncate">{result.title}</div>
                      {result.section && (
                        <div className="text-xs text-gray-400 truncate">{result.section}</div>
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

          {/* Label input */}
          <input
            type="text"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") cancel();
            }}
            placeholder="Display label (optional)"
            className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={commit}
              disabled={linkType === "external" ? !urlInput.trim() : !docSlugInput.trim()}
              className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              Apply
            </button>
            {hasLink && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={cancel}
                className="px-3 py-1 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Edit mode — link set, compact card with edit/remove actions
  return (
    <div className="my-1 not-prose" contentEditable={false}>
      <div className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg bg-white group">
        <div
          className={`flex items-center justify-center w-8 h-8 rounded-md ${isInternal ? "bg-green-50" : "bg-blue-50"} shrink-0`}
        >
          {isInternal ? (
            <FileText size={15} className="text-green-600" />
          ) : (
            <Link size={15} className="text-blue-500" />
          )}
        </div>
        <span className="flex-1 text-sm font-medium text-gray-800 truncate">{displayLabel}</span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setUrlInput(url);
              setLabelInput(label);
              const type = (block.props.linkType as "external" | "internal") || "external";
              setLinkType(type);
              setDocSlugInput(docSlug);
              setSearchQuery(cachedTitle || docSlug || "");
              setEditing(true);
            }}
            className="text-xs text-blue-500 hover:text-blue-700 px-2 py-0.5 rounded hover:bg-blue-50 transition-colors"
          >
            Edit
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
            className="text-xs text-red-400 hover:text-red-600 px-2 py-0.5 rounded hover:bg-red-50 transition-colors"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

export const LinkCardBlock = createReactBlockSpec(
  {
    type: "linkCard" as const,
    propSchema: {
      url: { default: "" as const },
      label: { default: "" as const },
      linkType: { default: "external" as const },
      docSlug: { default: "" as const },
      cachedTitle: { default: "" as const },
    },
    content: "none" as const,
  },
  {
    render: (props) => (
      <LinkCardBlockContent
        block={props.block as LinkCardBlockProps["block"]}
        editor={props.editor}
      />
    ),
  }
);
