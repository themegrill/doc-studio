"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { List } from "lucide-react";

interface Heading {
  id: string;
  text: string;
  level: number;
  element?: HTMLElement; // Store reference to actual DOM element for duplicates
}

export default function TableOfContents() {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [isEditMode, setIsEditMode] = useState(false);
  const cachedHeadingsRef = useRef<Heading[]>([]);

  useEffect(() => {
    // Clear headings immediately when pathname changes
    setHeadings([]);
    setActiveIndex(-1);
    cachedHeadingsRef.current = [];
    setIsEditMode(false);

    // Track all timeouts for proper cleanup
    const timeouts: NodeJS.Timeout[] = [];

    // Extract headings from the document
    const extractHeadings = () => {
      const editorElement = document.querySelector(".bn-editor");

      // If no editor found (e.g., on section pages), keep headings empty
      if (!editorElement) {
        setHeadings([]);
        return false;
      }

      const headingElements = document.querySelectorAll(
        ".bn-editor h1, .bn-editor h2, .bn-editor h3, .bn-editor h4",
      );

      // Extract all headings and keep duplicates (store element references)
      const headingData: Heading[] = Array.from(headingElements).flatMap((heading) => {
		const text = heading.textContent?.trim().replace(/^#+\s*/, "") || "";
		const id = heading.id;

		if (!text || !id) return [];

		return [
			{
			id,
			text,
			level: parseInt(heading.tagName.substring(1)),
			element: heading as HTMLElement,
			},
		];
	});

      // Check if we're in view mode (headings have IDs)
      if (headingData.length > 0) {
        setHeadings(headingData);
        cachedHeadingsRef.current = headingData;
        setIsEditMode(false);
        return true;
      } else if (headingElements.length > 0) {
        // Editing mode (headings exist but no IDs)
        setIsEditMode(true);
        // Show cached headings
        if (cachedHeadingsRef.current.length > 0) {
          setHeadings(cachedHeadingsRef.current);
        }
        return true;
      } else {
        // No headings found, clear everything
        setHeadings([]);
        return false;
      }
    };

    // Optimized retry mechanism
    let attemptCount = 0;
    const maxAttempts = 5;
    const retryDelays = [100, 200, 300, 500, 800];

    const tryExtract = () => {
      const found = extractHeadings();

      // retry if not found and attempts remain
      if (!found && attemptCount < maxAttempts) {
        const timeout = setTimeout(tryExtract, retryDelays[attemptCount]);
        timeouts.push(timeout);
        attemptCount++;
      }
    };
    tryExtract();

    // MutationObserver to watch for dynamic content changes
    const observer = new MutationObserver((mutations) => {
      // Check if any mutation affected headings or their IDs
      const hasRelevantChange = mutations.some((mutation) => {
        if (mutation.type === "attributes" && mutation.attributeName === "id") {
          return true;
        }
        if (mutation.type === "childList") {
          return true;
        }
        return false;
      });

      if (hasRelevantChange) {
        // Small delay to batch multiple mutations
        const timeout = setTimeout(() => extractHeadings(), 50);
        timeouts.push(timeout);
      }
    });

    // Start observing after initial attempts begin
    const startObserving = () => {
      const editorElement = document.querySelector(".bn-editor");
      if (editorElement) {
        observer.observe(editorElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["id", "class"],
        });
      } else {
        // Retry observation if editor not ready
        const timeout = setTimeout(startObserving, 200);
        timeouts.push(timeout);
      }
    };

    const observerTimeout = setTimeout(startObserving, 150);
    timeouts.push(observerTimeout);

    // Cleanup function - clear all timeouts and disconnect observer
    return () => {
      timeouts.forEach((timeout) => clearTimeout(timeout));
      observer.disconnect();
    };
  }, [pathname]); // Re-run when pathname changes

  useEffect(() => {
    // Track scroll position and highlight active heading based on visible content
    const handleScroll = () => {
      // Don't update active state in edit mode
      if (isEditMode || headings.length === 0) return;

      // Use stored element references instead of getElementById (for duplicates)
      const headingElements = headings
        .map((h) => (h.element || document.getElementById(h.id)) as HTMLElement)
        .filter((el): el is HTMLElement => el !== null);

      if (headingElements.length === 0) return;

      // Find the active heading: the last one whose top is above the threshold
      const THRESHOLD = 100; // px from top of viewport
      let currentActiveIndex = -1;

      // Iterate through headings to find the last one that's above the threshold
      for (let i = headingElements.length - 1; i >= 0; i--) {
        const element = headingElements[i];
        const rect = element.getBoundingClientRect();

        // If heading is above or near the top of viewport (within threshold)
        if (rect.top <= THRESHOLD) {
          currentActiveIndex = i;
          break;
        }
      }

      // If no heading is above threshold (at top of page), highlight the first one
      if (currentActiveIndex === -1 && headingElements.length > 0) {
        const firstRect = headingElements[0].getBoundingClientRect();
        // Only if the first heading is visible in viewport
        if (firstRect.top < window.innerHeight) {
          currentActiveIndex = 0;
        }
      }

      setActiveIndex(currentActiveIndex);
    };

    // Use requestAnimationFrame for smooth scroll tracking
    let rafId: number | null = null;
    let isScheduled = false;

    const throttledHandleScroll = () => {
      // Throttle using requestAnimationFrame for 60fps updates
      if (!isScheduled) {
        isScheduled = true;
        rafId = requestAnimationFrame(() => {
          handleScroll();
          isScheduled = false;
        });
      }
    };

    // Find the scrollable parent (main content area)
    const scrollContainer = document.querySelector('main') || window;

    // Use both scroll and resize events
    scrollContainer.addEventListener("scroll", throttledHandleScroll, { passive: true } as AddEventListenerOptions);
    window.addEventListener("resize", handleScroll, { passive: true });

    // Initial check with delay to ensure content is loaded
    const initialTimer = setTimeout(handleScroll, 300);

    return () => {
      clearTimeout(initialTimer);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      scrollContainer.removeEventListener("scroll", throttledHandleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [headings, isEditMode]);

  const scrollToHeading = (heading: Heading) => {
    // Don't scroll in edit mode
    if (isEditMode || !heading) return;

    // Use stored element reference if available (for duplicates), otherwise use ID
    const element = heading.element || document.getElementById(heading.id);

    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.pushState(null, "", `#${heading.id}`);
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
          On This Docs
        </h4>
      </div>

      {isEditMode && (
        <div className="mb-3 text-xs text-amber-600 bg-amber-50 px-2 py-1.5 rounded border border-amber-200">
          Editing Mode - Save to update
        </div>
      )}

      <nav className="space-y-1">
        {headings.map((heading, index) => {
          const isActive = !isEditMode && activeIndex === index;

          return (
            <button
              key={`toc-${index}-${heading.id}`}
              onClick={() => scrollToHeading(heading)}
              disabled={isEditMode}
              className={`
                block w-full text-left text-sm py-1.5 px-2 rounded transition-colors
                ${
                  isActive
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
          );
        })}
      </nav>
    </aside>
  );
}
