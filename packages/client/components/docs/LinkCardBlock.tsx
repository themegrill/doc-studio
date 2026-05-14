"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { Link, ExternalLink } from "lucide-react";

export const LinkCardBlock = createReactBlockSpec(
  {
    type: "linkCard" as const,
    propSchema: {
      url: { default: "" as const },
      label: { default: "" as const },
    },
    content: "none" as const,
  },
  {
    render: ({ block }) => {
      const { url, label } = block.props;
      if (!url) return <div />;
      const displayLabel = label || url;

      return (
        <div className="my-1 not-prose" contentEditable={false}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors group no-underline"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-blue-50 shrink-0">
              <Link size={15} className="text-blue-500" />
            </div>
            <span className="flex-1 text-sm font-medium text-gray-800 truncate">{displayLabel}</span>
            <ExternalLink size={14} className="text-gray-400 group-hover:text-blue-500 shrink-0 transition-colors" />
          </a>
        </div>
      );
    },
  }
);
