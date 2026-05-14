"use client";

import { useEffect, useMemo } from "react";
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

export default function DocRenderer({ doc, breadcrumbs }: Props) {
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

  return (
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
      <BlockNoteView editor={editor} editable={false} theme="light" />
    </div>
  );
}
