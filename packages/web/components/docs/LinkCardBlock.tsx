"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { Link, ExternalLink, X } from "lucide-react";

type LinkCardBlockProps = {
  block: { id: string; type: "linkCard"; props: { url: string; label: string } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any;
};

function LinkCardBlockContent({ block, editor }: LinkCardBlockProps) {
  const [editing, setEditing] = useState(false);
  const [urlInput, setUrlInput] = useState(block.props.url);
  const [labelInput, setLabelInput] = useState(block.props.label);
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) urlRef.current?.focus();
  }, [editing]);

  const commit = useCallback(() => {
    const trimmedUrl = urlInput.trim();
    if (!trimmedUrl) return;
    editor.updateBlock(block, {
      props: {
        url: trimmedUrl,
        label: labelInput.trim(),
      },
    });
    setEditing(false);
  }, [urlInput, labelInput, block, editor]);

  const cancel = useCallback(() => {
    setUrlInput(block.props.url);
    setLabelInput(block.props.label);
    setEditing(false);
  }, [block.props.url, block.props.label]);

  const clear = useCallback(() => {
    editor.updateBlock(block, { props: { url: "", label: "" } });
    setUrlInput("");
    setLabelInput("");
  }, [block, editor]);

  const { url, label } = block.props;
  const displayLabel = label || url;

  // View mode
  if (!editor.isEditable) {
    if (!url) return null;
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
  }

  // Edit mode — inline edit form
  if (editing || !url) {
    return (
      <div contentEditable={false} className="my-1 w-full">
        <div className="border border-blue-200 rounded-lg p-3 bg-white space-y-2 shadow-sm">
          <div className="flex items-center gap-2">
            <Link size={14} className="text-blue-400 shrink-0" />
            <span className="text-xs font-medium text-gray-600">Link Block</span>
            {url && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={cancel}
                className="ml-auto text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <input
            ref={urlRef}
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") cancel();
            }}
            placeholder="https://example.com"
            className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />
          <input
            type="text"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") cancel();
            }}
            placeholder="Display label (optional)"
            className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={commit}
              disabled={!urlInput.trim()}
              className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              Apply
            </button>
            {url && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={cancel}
                className="px-3 py-1 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Edit mode — URL already set, show compact card with edit/remove actions
  return (
    <div className="my-1 not-prose" contentEditable={false}>
      <div className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg bg-white group">
        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-blue-50 shrink-0">
          <Link size={15} className="text-blue-500" />
        </div>
        <span className="flex-1 text-sm font-medium text-gray-800 truncate">{displayLabel}</span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setUrlInput(url);
              setLabelInput(label);
              setEditing(true);
            }}
            className="text-xs text-blue-500 hover:text-blue-700 px-2 py-0.5 rounded hover:bg-blue-50 transition-colors"
          >
            Edit
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
            className="text-xs text-red-400 hover:text-red-600 px-2 py-0.5 rounded hover:bg-red-50 transition-colors"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

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
    render: (props) => (
      <LinkCardBlockContent
        block={props.block as LinkCardBlockProps["block"]}
        editor={props.editor}
      />
    ),
  }
);
