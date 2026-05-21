"use client";

import { useEffect, useMemo, useCallback } from "react";
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
  useEffect(() => {
    const assignHeadingIds = () => {
      const headings = document.querySelectorAll<HTMLElement>(
        ".bn-editor h1, .bn-editor h2, .bn-editor h3, .bn-editor h4"
      );
      const seen = new Map<string, number>();
      headings.forEach((el) => {
        if (el.id) return; // already has id
        const text = el.textContent?.trim() ?? "";
        if (!text) return;
        const base = text
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        const count = seen.get(base) ?? 0;
        el.id = count === 0 ? base : `${base}-${count}`;
        seen.set(base, count + 1);
      });
    };

    // Retry until headings are in the DOM
    const delays = [100, 300, 600, 1000];
    const timers = delays.map((d) => setTimeout(assignHeadingIds, d));
    return () => timers.forEach(clearTimeout);
  }, [doc.slug]);

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
          <h1 className="text-3xl font-medium mb-2">{cleanTitle}</h1>
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
        .bn-editor a[href] {
          color: #2563eb;
          text-decoration: underline;
          cursor: pointer;
        }
        .bn-editor a[href]:hover {
          color: #1d4ed8;
        }
      `}</style>
      <BlockNoteView editor={editor} editable={false} theme="light" />
    </div>
    </DocContextProvider>
  );
}
