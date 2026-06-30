"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { Info, AlertTriangle, Lightbulb, FileText, AlertCircle, Quote } from "lucide-react";

export const quoteTypeOptions = [
  { value: "default", label: "Default", icon: Quote },
  { value: "information", label: "Info", icon: Info },
  { value: "warning", label: "Warning", icon: AlertTriangle },
  { value: "tips", label: "Tips", icon: Lightbulb },
  { value: "note", label: "Note", icon: FileText },
  { value: "important", label: "Important", icon: AlertCircle },
] as const;

function QuoteBlockContent({
  block,
  editor,
  contentRef,
}: {
  block: any;
  editor: any;
  contentRef: any;
}) {
  const currentType = block.props.quoteType || "default";

  return (
    <blockquote
      ref={contentRef}
      className="bn-inline-content"
      data-quote-type={currentType}
    />
  );
}

export const QuoteBlock = createReactBlockSpec(
  {
    type: "quote" as const,
    propSchema: {
      quoteType: {
        default: "default" as const,
        values: ["default", "information", "warning", "tips", "note", "important"] as const,
      },
      textAlignment: {
        default: "left" as const,
        values: ["left", "center", "right", "justify"] as const,
      },
      backgroundColor: { default: "default" as const },
    },
    content: "inline" as const,
  },
  {
    render: (props) => (
      <QuoteBlockContent
        block={props.block}
        editor={props.editor}
        contentRef={props.contentRef}
      />
    ),
  }
);
