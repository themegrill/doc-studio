"use client";

import { useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { en as blockNoteLocale } from "@blocknote/core/locales";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { DocContent } from "@/lib/db/ContentManager";
import { parseTitleWithBadges } from "@/lib/parse-title-badges";
import { Badge } from "@/components/ui/badge-pro";
import Breadcrumb, { type BreadcrumbItem } from "@/components/docs/Breadcrumb";
import { VideoEmbedBlock } from "@/components/docs/VideoEmbedBlock";
import { LinkCardBlock } from "@/components/docs/LinkCardBlock";
import { ImageBlockWithAlt } from "@/components/docs/ImageBlockWithAlt";
import { DocContextProvider } from "@/contexts/DocContext";

const { video: _builtinVideo, image: _builtinImage, ...baseBlockSpecs } = defaultBlockSpecs;
const editorSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...baseBlockSpecs,
    image: ImageBlockWithAlt(),
    videoEmbed: VideoEmbedBlock(),
    linkCard: LinkCardBlock(),
  },
});

interface Props {
  doc: DocContent;
  slug: string;
  projectSlug?: string;
  breadcrumbs?: BreadcrumbItem[];
}

export default function DocRenderer({ doc, slug: _slug, projectSlug, breadcrumbs }: Props) {
  const router = useRouter();
  const titleBtnRef = useRef<HTMLButtonElement>(null);

  const { cleanTitle, badges } = useMemo(
    () => parseTitleWithBadges(doc.title),
    [doc.title]
  );

  const editor = useCreateBlockNote({
    schema: editorSchema,
    blocks: doc.blocks?.length ? (doc.blocks as any) : undefined,
    dictionary: blockNoteLocale,
  });

  useEffect(() => {
    if (!doc.blocks?.length) return;
    const t = setTimeout(() => {
      editor.replaceBlocks(editor.document, doc.blocks as any);
    }, 0);
    return () => clearTimeout(t);
  }, [doc.blocks, editor]);

  // BlockNote read-only mode doesn't assign id attributes to headings.
  // The TableOfContents component requires ids to function, so we add them
  // based on slugified heading text after the editor renders.
  // We also inject a copy-link anchor button after each heading.
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

        // Inject copy-link button if not already present
        if (el.id && !el.querySelector(".doc-anchor-btn")) {
          el.style.position = "relative";
          el.classList.add("group");

          const btn = document.createElement("button");
          btn.className = "doc-anchor-btn";
          btn.setAttribute("aria-label", "Copy link to section");
          btn.setAttribute("data-section-id", el.id);
          btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
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

    // Retry until headings are in the DOM
    const delays = [100, 300, 600, 1000];
    const timers = delays.map((d) => setTimeout(assignHeadingIds, d));

    // After IDs are assigned, scroll to the hash if present in the URL
    const scrollToHash = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      const target = document.getElementById(hash);
      if (target) {
        // Small offset so the heading isn't hidden under a sticky header
        setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      }
    };
    // Run after the last heading-id pass
    timers.push(setTimeout(scrollToHash, 1100));

    return () => timers.forEach(clearTimeout);
  }, [doc.slug]);

  // Enhance read-only code blocks with a header bar (language label) and a
  // copy-to-clipboard button. BlockNote renders the built-in codeBlock as
  // <div data-content-type="codeBlock"><pre><code>…</code></pre></div>; we inject
  // the header and wire the button via the DOM, mirroring the heading-anchor pattern.
  useEffect(() => {
    // Map block id -> language from the stored blocks (recursively).
    const langById = new Map<string, string>();
    const walk = (blocks: any[]) => {
      blocks.forEach((b) => {
        if (b?.id && b?.type === "codeBlock") {
          langById.set(b.id, b.props?.language || "text");
        }
        if (b?.children?.length) walk(b.children);
      });
    };
    if (doc.blocks?.length) walk(doc.blocks as any[]);

    const copyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
    const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

    const enhanceCodeBlocks = () => {
      const blocks = document.querySelectorAll<HTMLElement>(
        '.bn-editor [data-content-type="codeBlock"]'
      );
      blocks.forEach((block) => {
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

    const delays = [100, 300, 600, 1000];
    const timers = delays.map((d) => setTimeout(enhanceCodeBlocks, d));
    return () => timers.forEach(clearTimeout);
  }, [doc.slug, doc.blocks]);

  // In ProseMirror read-only mode (contenteditable=false), the browser does not
  // follow <a> hrefs on a plain click — ProseMirror intercepts the event.
  // We attach a delegated click listener on the editor element that handles:
  //   • internal doc links (doc:{slug}) — navigate via Next.js router
  //   • external links — open in new tab
  // The DOM patch still runs to give anchors real hrefs (so right-click → copy
  // link address works) and so that they receive link styling.
  const handleLinkClick = useCallback(
    (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (href.startsWith("#")) return;
      if (href.startsWith("doc:")) {
        e.preventDefault();
        e.stopPropagation();
        router.push(`/${href.slice(4)}`);
        return;
      }
      if (href.startsWith("/")) {
        e.preventDefault();
        e.stopPropagation();
        router.push(href);
        return;
      }
      if (href.startsWith("http://") || href.startsWith("https://")) return;
      // href="" — TipTap stripped a doc: href via isAllowedUri. Look up from ProseMirror state.
      const tiptap = (editor as any)._tiptapEditor;
      if (!tiptap?.state || !tiptap?.view) return;
      try {
        const pos = tiptap.view.posAtDOM(anchor, 0);
        const $pos = tiptap.state.doc.resolve(pos);
        const linkMark = $pos.marks().find((m: any) => m.type.name === "link");
        if (linkMark?.attrs.href?.startsWith("doc:")) {
          e.preventDefault();
          e.stopPropagation();
          router.push(`/${linkMark.attrs.href.slice(4)}`);
        }
      } catch { /* ignore */ }
    },
    [router, editor],
  );

  useEffect(() => {
    // Use the editor's own DOM element rather than a document-level query so we
    // always target the correct element even when multiple views are mounted.
    const editorEl = (editor as any)._tiptapEditor?.view?.dom as HTMLElement | undefined;
    if (!editorEl) return;

    // TipTap strips "doc:" via isAllowedUri producing href="" in the DOM.
    // Read doc: links from ProseMirror state and patch DOM nodes via view.domAtPos.
    const patch = () => {
      const tiptap = (editor as any)._tiptapEditor;
      if (!tiptap?.state || !tiptap?.view) return;
      const linkMarkType = tiptap.state.schema.marks.link;
      if (!linkMarkType) return;
      tiptap.state.doc.nodesBetween(0, tiptap.state.doc.content.size, (node: any, pos: number) => {
        if (!node.isText) return;
        const linkMark = node.marks.find((m: any) => m.type === linkMarkType);
        if (!linkMark?.attrs.href?.startsWith("doc:")) return;
        const slug = linkMark.attrs.href.slice(4);
        try {
          const domInfo = tiptap.view.domAtPos(pos + 1);
          let el: Node | null = domInfo.node;
          if (el?.nodeType === Node.TEXT_NODE) el = el.parentElement;
          while (el && (el as Element).tagName !== "A") el = (el as Element).parentElement;
          if (el && (el as Element).tagName === "A") {
            (el as HTMLElement).setAttribute("href", `/${slug}`);
            (el as HTMLElement).removeAttribute("target");
            (el as HTMLElement).removeAttribute("rel");
          }
        } catch { /* skip */ }
      });
    };
    const delays = [100, 300, 600, 1000];
    const timers = delays.map((d) => setTimeout(patch, d));

    // Use capture phase so our handler fires before ProseMirror's event handlers.
    editorEl.addEventListener("click", handleLinkClick as EventListener, true);

    return () => {
      timers.forEach(clearTimeout);
      editorEl.removeEventListener("click", handleLinkClick as EventListener, true);
    };
  }, [doc.slug, handleLinkClick, editor]);

  return (
    <DocContextProvider projectSlug={projectSlug}>
    <div className="max-w-[1000px] mx-auto">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb items={breadcrumbs} />
      )}
      {/* Title */}
      <div className="flex justify-between items-start mb-6 pb-4 border-b">
        <div className="flex-1 mr-4">
          <h1 className="text-3xl font-medium mb-2 inline group">
            {cleanTitle}
            <button
              ref={titleBtnRef}
              aria-label="Copy link to this doc"
              className="doc-anchor-btn"
              onClick={() => {
                const url = `${window.location.origin}${window.location.pathname}`;
                navigator.clipboard.writeText(url).then(() => {
                  titleBtnRef.current?.classList.add("copied");
                  setTimeout(() => titleBtnRef.current?.classList.remove("copied"), 2000);
                });
              }}
              dangerouslySetInnerHTML={{ __html: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>` }}
            />
          </h1>
          {badges.map((badge, i) => (
            <Badge key={i} variant={badge.variant}>
              {badge.text}
            </Badge>
          ))}
        {doc.description && (
          <p className="text-gray-600">{doc.description}</p>
        )}
        </div>
      </div>

      {/* Read-only content */}
      <style>{`
        html { scroll-behavior: smooth; }
        .bn-editor a[href] {
          color: #2563eb;
          text-decoration: underline;
          cursor: pointer;
        }
        .bn-editor a[href]:hover {
          color: #1d4ed8;
        }
        .bn-editor h1, .bn-editor h2, .bn-editor h3, .bn-editor h4 {
          display: inline;
        }
        .doc-anchor-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          color: #9ca3af;
          background: none;
          border: none;
          padding: 2px;
          margin-left: 0.35em;
          border-radius: 4px;
          cursor: pointer;
          transition: opacity 0.15s, color 0.15s;
          vertical-align: middle;
          position: relative;
          top: -1px;
        }
        h1.group:hover .doc-anchor-btn,
        .bn-editor h1:hover .doc-anchor-btn,
        .bn-editor h2:hover .doc-anchor-btn,
        .bn-editor h3:hover .doc-anchor-btn,
        .bn-editor h4:hover .doc-anchor-btn {
          opacity: 1;
        }
        .doc-anchor-btn:hover {
          color: #3b82f6;
        }
        .doc-anchor-btn.copied {
          opacity: 1;
        }
      `}</style>
      <BlockNoteView editor={editor} editable={false} theme="light" />
    </div>
    </DocContextProvider>
  );
}
