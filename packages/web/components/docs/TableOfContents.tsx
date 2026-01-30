"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { List } from "lucide-react";

interface Heading {
  id: string;
  text: string;
  level: number;
}

export default function TableOfContents() {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [isEditMode, setIsEditMode] = useState(false);
  const cachedHeadingsRef = useRef<Heading[]>([]);

  useEffect(() => {
    // Clear headings immediately when pathname changes
    setHeadings([]);
    setActiveId("");
    cachedHeadingsRef.current = [];
    setIsEditMode(false);

    // Extract headings from the document
    const extractHeadings = () => {
      const editorElement = document.querySelector(".bn-editor");

      // If no editor found (e.g., on section pages), keep headings empty
      if (!editorElement) {
        setHeadings([]);
        return;
      }

      const headingElements = document.querySelectorAll(
        ".bn-editor h1, .bn-editor h2, .bn-editor h3, .bn-editor h4"
      );

      const headingData: Heading[] = Array.from(headingElements)
        .map((heading) => {
          const text = heading.textContent?.trim().replace(/^#+\s*/, "") || "";
          return {
            id: heading.id,
            text: text,
            level: parseInt(heading.tagName.substring(1)),
          };
        })
        .filter((h) => h.text && h.text.length > 0 && h.id);

      // Check if we're in view mode (headings have IDs)
      if (headingData.length > 0) {
        // View mode - update both current and cached
        setHeadings(headingData);
        cachedHeadingsRef.current = headingData;
        setIsEditMode(false);
      } else if (headingElements.length > 0) {
        // Edit mode (headings exist but no IDs)
        setIsEditMode(true);
        // Show cached headings from last view mode
        if (cachedHeadingsRef.current.length > 0) {
          setHeadings(cachedHeadingsRef.current);
        }
      } else {
        // No headings found, clear everything
        setHeadings([]);
      }
    };

    // Initial extraction with retries to catch async content
    let attempts = 0;
    const tryExtract = () => {
      extractHeadings();
      attempts++;
      if (attempts < 8) {
        setTimeout(tryExtract, 400);
      }
    };

    // Start extraction after a short delay to let the page render
    const initialDelay = setTimeout(tryExtract, 100);

    return () => {
      clearTimeout(initialDelay);
    };

    // Watch for changes (to detect save/edit mode transitions and content updates)
    const observer = new MutationObserver((mutations) => {
      // Check if any mutation affected headings or their IDs
      const hasRelevantChange = mutations.some((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'id') {
          return true;
        }
        if (mutation.type === 'childList') {
          return true;
        }
        return false;
      });

      if (hasRelevantChange) {
        setTimeout(() => extractHeadings(), 100);
      }
    });

    // Wait for editor to appear, then observe it
    const startObserving = () => {
      const editorElement = document.querySelector(".bn-editor");
      if (editorElement) {
        observer.observe(editorElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["id", "class"],
        });
      }
    };

    // Try to start observing after a delay
    const observerDelay = setTimeout(startObserving, 500);

    return () => {
      clearTimeout(observerDelay);
      observer.disconnect();
    };
  }, [pathname]); // Re-run when pathname changes (navigating between docs)

  useEffect(() => {
    // Track scroll position and highlight active heading based on visible content
    const handleScroll = () => {
      // Don't update active state in edit mode
      if (isEditMode || headings.length === 0) return;

      const headingElements = headings
        .map((h) => document.getElementById(h.id))
        .filter((el): el is HTMLElement => el !== null);

      if (headingElements.length === 0) return;

      // Use Intersection Observer approach for better accuracy
      let currentActiveId = "";
      const scrollTop = window.scrollY;
      const viewportHeight = window.innerHeight;
      const scrollCenter = scrollTop + viewportHeight / 3; // Top third of viewport

      // Find the heading closest to the top third of the viewport
      let closestDistance = Infinity;

      for (const element of headingElements) {
        const rect = element.getBoundingClientRect();
        const elementTop = scrollTop + rect.top;

        // Calculate distance from the scroll center
        const distance = Math.abs(elementTop - scrollCenter);

        // Only consider headings that are above or near the scroll center
        if (elementTop <= scrollCenter + 100) {
          if (distance < closestDistance) {
            closestDistance = distance;
            currentActiveId = element.id;
          }
        }
      }

      // If no heading is found above, use the first one
      if (!currentActiveId && headingElements.length > 0) {
        const firstElement = headingElements[0];
        const firstRect = firstElement.getBoundingClientRect();
        if (firstRect.top > 0) {
          currentActiveId = firstElement.id;
        }
      }

      setActiveId(currentActiveId);
    };

    // Use both scroll and resize events
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });

    // Initial check with delay to ensure content is loaded
    const initialTimer = setTimeout(handleScroll, 300);

    return () => {
      clearTimeout(initialTimer);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [headings, isEditMode]);

  const scrollToHeading = (id: string) => {
    // Don't scroll in edit mode
    if (isEditMode || !id) return;

    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.pushState(null, "", `#${id}`);
    }
  };

  if (headings.length === 0) {
    return null;
  }

  return (
    <aside className="w-64 border-l bg-gray-50 p-6 overflow-y-auto hidden xl:block">
      <div className="flex items-center gap-2 mb-4">
        <List size={16} className="text-gray-600" />
        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
          On This Page
        </h4>
      </div>

      {isEditMode && (
        <div className="mb-3 text-xs text-amber-600 bg-amber-50 px-2 py-1.5 rounded border border-amber-200">
          Editing mode - save to update ToC
        </div>
      )}

      <nav className="space-y-1">
        {headings.map((heading, index) => (
          <button
            key={heading.id || `heading-${index}`}
            onClick={() => scrollToHeading(heading.id)}
            disabled={isEditMode}
            className={`
              block w-full text-left text-sm py-1.5 px-2 rounded transition-colors
              ${
                !isEditMode && activeId === heading.id
                  ? "text-blue-600 bg-blue-50 font-medium"
                  : "text-gray-600"
              }
              ${!isEditMode ? "hover:text-gray-900 hover:bg-gray-100" : "cursor-default"}
              ${heading.level === 1 ? "pl-2" : ""}
              ${heading.level === 2 ? "pl-4" : ""}
              ${heading.level === 3 ? "pl-6" : ""}
              ${heading.level === 4 ? "pl-8" : ""}
            `}
            title={heading.text}
          >
            <span className="line-clamp-2">{heading.text}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
