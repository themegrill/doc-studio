"use client";

import { createReactBlockSpec, ResizableFileBlockWrapper, useResolveUrl } from "@blocknote/react";
import { Image as ImageIcon } from "lucide-react";

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
      previewWidth: { default: undefined as undefined, type: "number" as const },
      alt: { default: "" as const },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const resolved = useResolveUrl(block.props.url);
      const src =
        resolved.loadingState === "loaded" ? resolved.downloadUrl : block.props.url;

      return (
        <ResizableFileBlockWrapper block={block as any} editor={editor as any} buttonIcon={<ImageIcon size={24} />}>
          <img
            className="bn-visual-media"
            src={src}
            alt={(block.props as any).alt || (block.props as any).caption || ""}
            contentEditable={false}
            draggable={false}
          />
        </ResizableFileBlockWrapper>
      );
    },
  }
);
