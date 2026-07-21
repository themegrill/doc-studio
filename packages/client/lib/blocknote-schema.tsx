import { createReactInlineContentSpec } from "@blocknote/react";
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { VideoEmbedBlock } from "@/components/docs/VideoEmbedBlock";
import { LinkCardBlock } from "@/components/docs/LinkCardBlock";
import { ImageBlockWithAlt } from "@/components/docs/ImageBlockWithAlt";
import { QuoteBlock } from "@/components/docs/QuoteBlock";
import { codeBlockSpec } from "@/lib/code-block";

const { video: _builtinVideo, image: _builtinImage, quote: _builtinQuote, ...baseBlockSpecs } = defaultBlockSpecs;

export const ProBadge = createReactInlineContentSpec(
  {
    type: "proBadge",
    propSchema: {},
    content: "none",
  },
  {
    render: () => (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-green-500 text-white select-none ml-1 align-middle">
        Pro
      </span>
    ),
  }
);

export const editorSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...baseBlockSpecs,
    image: ImageBlockWithAlt(),
    videoEmbed: VideoEmbedBlock(),
    linkCard: LinkCardBlock(),
    quote: QuoteBlock(),
    // Syntax-highlighted code block (Shiki) — replaces the default plain spec.
    codeBlock: codeBlockSpec,
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    proBadge: ProBadge,
  },
});
