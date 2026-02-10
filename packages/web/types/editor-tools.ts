import { PartialBlock } from "@blocknote/core";

/**
 * Tool call types that the AI can request
 */
export type EditorToolCall =
  | InsertBlocksTool
  | UpdateBlockTool
  | DeleteBlocksTool
  | SearchBlocksTool
  | GetBlocksStructureTool
  | ReplaceTextTool;

/**
 * Insert new blocks into the editor
 */
export interface InsertBlocksTool {
  tool: "insert_blocks";
  parameters: {
    blocks: PartialBlock[];
    position: "start" | "end" | "before" | "after";
    referenceBlockId?: string; // Required when position is "before" or "after"
  };
}

/**
 * Update an existing block
 */
export interface UpdateBlockTool {
  tool: "update_block";
  parameters: {
    blockId: string;
    update: PartialBlock;
  };
}

/**
 * Delete blocks from the editor
 */
export interface DeleteBlocksTool {
  tool: "delete_blocks";
  parameters: {
    blockIds: string[];
  };
}

/**
 * Search for blocks by content or type
 */
export interface SearchBlocksTool {
  tool: "search_blocks";
  parameters: {
    query?: string; // Text to search for in block content
    type?: string; // Block type to filter by (e.g., "heading", "paragraph")
  };
}

/**
 * Get the full document structure with block IDs
 */
export interface GetBlocksStructureTool {
  tool: "get_blocks_structure";
  parameters: Record<string, never>; // No parameters needed
}

/**
 * Find and replace text across blocks
 */
export interface ReplaceTextTool {
  tool: "replace_text";
  parameters: {
    find: string;
    replace: string;
    blockIds?: string[]; // Optional: limit to specific blocks
  };
}

/**
 * Result of a search_blocks tool call
 */
export interface BlockSearchResult {
  id: string;
  type: string;
  content: string;
  props?: Record<string, unknown>;
  matchType?: "exact" | "fuzzy"; // Type of match found
  similarity?: number; // Similarity score (0-1) for fuzzy matches
}

/**
 * Result of get_blocks_structure tool call
 */
export interface BlockStructureNode {
  id: string;
  type: string;
  content: string;
  props?: Record<string, unknown>;
  children?: BlockStructureNode[];
}

/**
 * AI response that may contain tool calls
 */
export interface AIResponse {
  content?: string; // Text response
  toolCall?: EditorToolCall; // Optional tool to execute
  requiresPermission?: boolean; // Whether to ask user before executing
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  success: boolean;
  message: string;
  data?: unknown;
}
