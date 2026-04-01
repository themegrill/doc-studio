"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, FileText, Loader2 } from "lucide-react";

interface SearchResult {
  id: string;
  title: string;
  slug: string;
  description?: string;
  section?: string;
}

interface SearchDialogProps {
  projectSlug?: string | null;
}

export default function SearchDialog({ projectSlug }: SearchDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Keyboard shortcut to open search (Cmd+K / Ctrl+K)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [open]);

  // Search function
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: searchQuery,
        ...(projectSlug && { projectSlug }),
      });

      const response = await fetch(`/api/search?${params}`);
      const data = await response.json();

      if (response.ok) {
        setResults(data.results || []);
      } else {
        setResults([]);
      }
    } catch (error) {
      console.error("Search error:", error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [projectSlug]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, performSearch]);

  // Handle result selection
  const handleSelect = useCallback((result: SearchResult) => {
    const url = projectSlug
      ? `/projects/${projectSlug}/docs/${result.slug}`
      : `/docs/${result.slug}`;
    router.push(url);
    setOpen(false);
  }, [projectSlug, router]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i < results.length - 1 ? i + 1 : i));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i > 0 ? i - 1 : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, results, selectedIndex, handleSelect]);

  return (
    <>
      {/* Search Trigger Button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-md hover:border-gray-300 transition-colors"
      >
        <Search size={16} />
        <span className="flex-1 text-left">Search documentation...</span>
        <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      {/* Search Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0">
          <DialogTitle className="sr-only">Search Documentation</DialogTitle>
          {/* Search Input */}
          <div className="flex items-center border-b px-4 py-3">
            <Search size={18} className="text-gray-400 mr-2" />
            <Input
              placeholder="Search documentation..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-base"
              autoFocus
            />
            {loading && <Loader2 size={18} className="text-gray-400 animate-spin ml-2" />}
          </div>

          {/* Results */}
          <div className="max-h-96 overflow-y-auto">
            {query && !loading && results.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                No results found for &quot;{query}&quot;
              </div>
            )}

            {results.length > 0 && (
              <div className="py-2">
                {results.map((result, index) => (
                  <button
                    key={result.id}
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full px-4 py-3 text-left flex items-start gap-3 transition-colors ${
                      index === selectedIndex
                        ? "bg-blue-50 border-l-2 border-blue-500"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <FileText size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 truncate">
                        {result.title}
                      </div>
                      {result.section && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          {result.section}
                        </div>
                      )}
                      {result.description && (
                        <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                          {result.description}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!query && (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                Type to search documentation...
              </div>
            )}
          </div>

          {/* Footer */}
          {results.length > 0 && (
            <div className="border-t px-4 py-2 flex items-center justify-between text-xs text-gray-500">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded">↑</kbd>
                  <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded">↓</kbd>
                  to navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded">↵</kbd>
                  to select
                </span>
              </div>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded">ESC</kbd>
                to close
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
