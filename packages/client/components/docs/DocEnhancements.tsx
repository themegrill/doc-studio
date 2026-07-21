"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Block } from "@/lib/api";

const copyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
const linkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;

interface Props {
  slug: string;
  blocks?: Block[];
}

/**
 * Progressive enhancement layer for the statically server-rendered doc body:
 * heading anchor buttons, code-block copy buttons/language labels, internal
 * link client-side routing, and scroll-to-hash. Runs against the already
 *-visible static HTML — none of this content depends on JS to appear.
 */
export default function DocEnhancements({ slug, blocks }: Props) {
  const router = useRouter();

  useEffect(() => {
    const assignHeadingIds = () => {
      const headings = document.querySelectorAll<HTMLElement>(
        ".bn-editor h1, .bn-editor h2, .bn-editor h3, .bn-editor h4"
      );
      const seen = new Map<string, number>();
      headings.forEach((el) => {
        if (!el.id) {
          const text = el.textContent?.trim() ?? "";
          if (!text) return;
          const base = text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
          const count = seen.get(base) ?? 0;
          el.id = count === 0 ? base : `${base}-${count}`;
          seen.set(base, count + 1);
        }

        if (el.id && !el.querySelector(".doc-anchor-btn")) {
          el.style.position = "relative";
          el.classList.add("group");

          const btn = document.createElement("button");
          btn.className = "doc-anchor-btn";
          btn.setAttribute("aria-label", "Copy link to section");
          btn.setAttribute("data-section-id", el.id);
          btn.innerHTML = linkIcon;
          el.appendChild(btn);

          btn.addEventListener("click", (e) => {
            e.preventDefault();
            const url = `${window.location.origin}${window.location.pathname}#${el.id}`;
            navigator.clipboard.writeText(url).then(() => {
              btn.classList.add("copied");
              setTimeout(() => btn.classList.remove("copied"), 2000);
            });
          });
        }
      });
    };

    const scrollToHash = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      const target = document.getElementById(hash);
      if (target) {
        setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      }
    };

    assignHeadingIds();
    scrollToHash();
  }, [slug]);

  useEffect(() => {
    const langById = new Map<string, string>();
    const walk = (list: any[]) => {
      list.forEach((b) => {
        if (b?.id && b?.type === "codeBlock") {
          langById.set(b.id, b.props?.language || "text");
        }
        if (b?.children?.length) walk(b.children);
      });
    };
    if (blocks?.length) walk(blocks as any[]);

    const enhanceCodeBlocks = () => {
      const codeBlocks = document.querySelectorAll<HTMLElement>(
        '.bn-editor [data-content-type="codeBlock"]'
      );
      codeBlocks.forEach((block) => {
        if (block.dataset.codeEnhanced) return;
        const pre = block.querySelector("pre");
        if (!pre) return;
        block.dataset.codeEnhanced = "true";

        const wrapper = block.closest<HTMLElement>("[data-id]");
        const lang = (wrapper && langById.get(wrapper.dataset.id || "")) || "text";

        const header = document.createElement("div");
        header.className = "doc-code-header";

        const label = document.createElement("span");
        label.className = "doc-code-lang";
        label.textContent = lang;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "doc-code-copy";
        btn.setAttribute("aria-label", "Copy code");
        const setLabel = (copied: boolean) => {
          btn.innerHTML = `${copied ? checkIcon : copyIcon}<span>${copied ? "Copied!" : "Copy"}</span>`;
        };
        setLabel(false);

        btn.addEventListener("click", () => {
          navigator.clipboard.writeText(pre.textContent ?? "").then(() => {
            btn.classList.add("copied");
            setLabel(true);
            setTimeout(() => {
              btn.classList.remove("copied");
              setLabel(false);
            }, 2000);
          });
        });

        header.appendChild(label);
        header.appendChild(btn);
        block.insertBefore(header, block.firstChild);
      });
    };

    enhanceCodeBlocks();
  }, [slug, blocks]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!href || href.startsWith("#")) return;
      if (href.startsWith("http://") || href.startsWith("https://")) return;
      if (href.startsWith("/")) {
        e.preventDefault();
        router.push(href);
      }
    };

    const container = document.querySelector(".bn-editor");
    container?.addEventListener("click", handleClick as EventListener);
    return () => container?.removeEventListener("click", handleClick as EventListener);
  }, [slug, router]);

  return null;
}
