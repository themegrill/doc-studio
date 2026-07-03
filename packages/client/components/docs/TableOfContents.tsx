"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { List } from "lucide-react";

interface Heading {
  id: string;
  text: string;
  level: number;
  element: HTMLElement;
}

export default function TableOfContents() {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    setHeadings([]);
    setActiveIndex(-1);

    const timers: NodeJS.Timeout[] = [];

    const extractHeadings = () => {
      const elements = document.querySelectorAll<HTMLElement>(
        ".bn-editor h1, .bn-editor h2, .bn-editor h3, .bn-editor h4"
      );
      if (!elements.length) return false;

      const data: Heading[] = Array.from(elements).flatMap((el) => {
        const text = el.textContent?.trim().replace(/^#+\s*/, "") ?? "";
        const id = el.id;
        if (!text || !id) return [];
        return [{ id, text, level: parseInt(el.tagName[1]), element: el }];
      });

      if (data.length) {
        setHeadings(data);
        return true;
      }
      return false;
    };

    // Retry until DocRenderer has assigned IDs to headings
    let attempt = 0;
    const delays = [150, 350, 700, 1200];
    const tryExtract = () => {
      if (!extractHeadings() && attempt < delays.length) {
        timers.push(setTimeout(tryExtract, delays[attempt++]));
      }
    };
    tryExtract();

    const observer = new MutationObserver(() => {
      timers.push(setTimeout(extractHeadings, 50));
    });

    const startObserver = () => {
      const el = document.querySelector(".bn-editor");
      if (el) {
        observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["id"] });
      } else {
        timers.push(setTimeout(startObserver, 200));
      }
    };
    timers.push(setTimeout(startObserver, 150));

    return () => {
      timers.forEach(clearTimeout);
      observer.disconnect();
    };
  }, [pathname]);

  useEffect(() => {
    if (!headings.length) return;

    const THRESHOLD = 100;
    let rafId: number | null = null;
    let scheduled = false;

    const handleScroll = () => {
      let active = -1;
      for (let i = headings.length - 1; i >= 0; i--) {
        if (headings[i].element.getBoundingClientRect().top <= THRESHOLD) {
          active = i;
          break;
        }
      }
      if (active === -1 && headings[0]?.element.getBoundingClientRect().top < window.innerHeight) {
        active = 0;
      }
      setActiveIndex(active);
    };

    const throttled = () => {
      if (!scheduled) {
        scheduled = true;
        rafId = requestAnimationFrame(() => { handleScroll(); scheduled = false; });
      }
    };

    const scroller = document.querySelector("main") ?? window;
    scroller.addEventListener("scroll", throttled, { passive: true } as AddEventListenerOptions);
    window.addEventListener("resize", handleScroll, { passive: true });
    const t = setTimeout(handleScroll, 300);

    return () => {
      clearTimeout(t);
      if (rafId !== null) cancelAnimationFrame(rafId);
      scroller.removeEventListener("scroll", throttled);
      window.removeEventListener("resize", handleScroll);
    };
  }, [headings]);

  const scrollTo = (h: Heading) => {
    h.element.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.pushState(null, "", `#${h.id}`);
  };

  if (!headings.length) return null;

  return (
    <aside className="w-64 border-l border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-6 overflow-y-auto hidden xl:block">
      <div className="flex items-center gap-2 mb-4">
        <List size={16} className="text-gray-600 dark:text-gray-400" />
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
          On This Docs
        </h4>
      </div>
      <nav className="space-y-1">
        {headings.map((h, i) => (
          <button
            key={`${h.id}-${i}`}
            onClick={() => scrollTo(h)}
            className={`block w-full text-left text-sm py-1.5 px-2 rounded transition-colors hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800
              ${activeIndex === i ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-medium" : "text-gray-600 dark:text-gray-400"}
              ${h.level === 1 ? "pl-2" : ""}
              ${h.level === 2 ? "pl-4" : ""}
              ${h.level === 3 ? "pl-6" : ""}
              ${h.level === 4 ? "pl-8" : ""}
            `}
            title={h.text}
          >
            <span className="line-clamp-2">{h.text}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
