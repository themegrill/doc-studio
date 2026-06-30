"use client";

import { useBlockNoteEditor, useEditorState } from "@blocknote/react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { quoteTypeOptions } from "@/components/docs/QuoteBlock";

export function QuoteTypeDropdown() {
  const editor = useBlockNoteEditor() as any;

  // Track the active block using useEditorState
  const activeBlock = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      try {
        const pos = e.getTextCursorPosition();
        if (pos && pos.block) {
          return pos.block;
        }
      } catch {
        // ignore
      }
      return undefined;
    },
  });

  // Only render if a block of type "quote" is selected
  if (!activeBlock || activeBlock.type !== "quote") {
    return null;
  }

  const currentType = activeBlock.props.quoteType || "default";
  const currentOption = quoteTypeOptions.find((opt) => opt.value === currentType) || quoteTypeOptions[0];
  const CurrentIcon = currentOption.icon;

  const handleSelect = (val: string) => {
    editor.updateBlock(activeBlock, {
      props: { quoteType: val },
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="bn-button flex items-center gap-1 px-2 py-1"
          style={{ height: "auto" }}
          title="Notice Type"
          onMouseDown={(e) => e.preventDefault()}
        >
          <CurrentIcon size={14} className="text-gray-500" />
          <span className="text-xs font-medium text-gray-700">{currentOption.label}</span>
          <ChevronDown size={12} className="text-gray-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40 z-[99999]">
        {quoteTypeOptions.map((opt) => {
          const Icon = opt.icon;
          return (
            <DropdownMenuItem
              key={opt.value}
              onSelect={() => handleSelect(opt.value)}
              className="flex items-center gap-2 cursor-pointer text-xs"
            >
              <Icon size={14} className="text-gray-500" />
              <span>{opt.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
