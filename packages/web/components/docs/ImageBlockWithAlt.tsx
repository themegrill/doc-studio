"use client";

import { createReactBlockSpec, ResizableFileBlockWrapper, useResolveUrl } from "@blocknote/react";
import { Image as ImageIcon, AlertTriangle, BookOpen } from "lucide-react";
import { useGuidelines } from "@/hooks/use-editorial";

type ImageBlock = {
  id: string;
  type: "image";
  props: {
    url: string;
    alt: string;
    caption: string;
    name: string;
    showPreview: boolean;
    previewWidth: number | undefined;
    textAlignment: "left" | "center" | "right" | "justify";
    backgroundColor: string;
  };
};

function AltImagePreview({ block }: { block: ImageBlock }) {
  const resolved = useResolveUrl(block.props.url);
  const src =
    resolved.loadingState === "loaded" ? resolved.downloadUrl : block.props.url;
  return (
    <img
      className="bn-visual-media"
      src={src}
      alt={block.props.alt || block.props.caption || ""}
      contentEditable={false}
      draggable={false}
    />
  );
}

function ImageBlockContent({
  block,
  editor,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  block: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any;
}) {
  const hasUrl = !!block.props.url;
  // Global ruleset: the alt requirement and the annotation style guide are
  // org-wide, so this hint does not need the per-project override.
  const { guidelines } = useGuidelines();
  const altMissing = !String(block.props.alt ?? "").trim();

  return (
    <div>
      <ResizableFileBlockWrapper
        block={block}
        editor={editor}
        buttonIcon={<ImageIcon size={24} />}
      >
        <AltImagePreview block={block} />
      </ResizableFileBlockWrapper>

      {editor.isEditable && hasUrl && (
        <div
          contentEditable={false}
          className="flex items-center gap-1.5 mt-1"
        >
          <span className="text-[10px] uppercase tracking-wide text-gray-400 font-medium shrink-0 select-none">
            Alt
          </span>
          <input
            type="text"
            value={block.props.alt ?? ""}
            onChange={(e) =>
              editor.updateBlock(block, { props: { alt: e.target.value } })
            }
            onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            placeholder="Describe this image for screen readers and SEO…"
            className="flex-1 text-xs text-gray-500 bg-transparent border-none outline-none placeholder:text-gray-300 focus:placeholder:text-gray-400 py-0.5"
          />

          {/* Alt text is required by the editorial guidelines (DOCSTUDIO-45 §3)
              but was previously only suggested by the placeholder. */}
          {guidelines.images.requireAlt && altMissing && (
            <span
              title="Alt text is required by the documentation guidelines"
              className="flex items-center gap-1 shrink-0 text-[10px] font-medium text-amber-600 select-none"
            >
              <AlertTriangle size={11} />
              Required
            </span>
          )}

          {/* Annotation consistency is human judgement, so the guide is linked
              at the moment it is needed rather than checked. */}
          {guidelines.images.annotationStyleGuideUrl && (
            <a
              href={guidelines.images.annotationStyleGuideUrl}
              target="_blank"
              rel="noopener noreferrer"
              onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              title="Annotation style guide"
              className="flex items-center gap-1 shrink-0 text-[10px] font-medium text-gray-400 hover:text-blue-600 transition-colors select-none"
            >
              <BookOpen size={11} />
              Annotation style
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export const ImageBlockWithAlt = createReactBlockSpec(
  {
    type: "image" as const,
    propSchema: {
      textAlignment: {
        default: "left" as const,
        values: ["left", "center", "right", "justify"] as const,
      },
      backgroundColor: { default: "default" as const },
      name: { default: "" as const },
      url: { default: "" as const },
      caption: { default: "" as const },
      showPreview: { default: true as const },
      // matches BlockNote's native previewWidth: no concrete default, typed as number
      previewWidth: { default: undefined as undefined, type: "number" as const },
      alt: { default: "" as const },
    },
    content: "none" as const,
  },
  {
    render: (props) => (
      <ImageBlockContent block={props.block} editor={props.editor} />
    ),
  },
);
