import { Block, BlockNoteEditor, PartialBlock } from "@blocknote/core";
import {
  BlockSearchResult,
  BlockStructureNode,
  EditorToolCall,
  ToolExecutionResult,
} from "@/types/editor-tools";

/**
 * Execute editor tool calls from AI
 */
export async function executeEditorTool(
  editor: BlockNoteEditor,
  toolCall: EditorToolCall,
): Promise<ToolExecutionResult> {
  try {
    switch (toolCall.tool) {
      case "insert_blocks":
        return await insertBlocks(editor, toolCall.parameters);

      case "update_block":
        return await updateBlock(editor, toolCall.parameters);

      case "delete_blocks":
        return await deleteBlocks(editor, toolCall.parameters);

      case "search_blocks":
        return await searchBlocks(editor, toolCall.parameters);

      case "get_blocks_structure":
        return await getBlocksStructure(editor);

      case "replace_text":
        return await replaceText(editor, toolCall.parameters);

      default:
        return {
          success: false,
          message: `Unknown tool: ${(toolCall as EditorToolCall).tool}`,
        };
    }
  } catch (error) {
    console.error("[executeEditorTool] Error:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Convert any content format to a plain string
 */
function contentToString(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item) {
          return String(item.text);
        }
        return '';
      })
      .join('');
  }
  return '';
}

/**
 * Normalize blocks for BlockNote insertion
 * Uses a two-step approach: create minimal blocks, then update with content
 */
function normalizeBlocks(blocks: PartialBlock[]): Array<{ minimal: PartialBlock; textContent?: string }> {
  const results: Array<{ minimal: PartialBlock; textContent?: string }> = [];

  for (const block of blocks) {
    let blockType = block.type || 'paragraph';

    // Handle legacy "list" type - convert to appropriate list item type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((blockType as any) === 'list') {
      const isOrdered = block.props && typeof block.props === 'object' &&
                       'ordered' in block.props && block.props.ordered === true;
      blockType = isOrdered ? 'numberedListItem' : 'bulletListItem';

      // If the list has children, convert each child to a list item
      if (block.children && Array.isArray(block.children) && block.children.length > 0) {
        // Recursively normalize and flatten children as separate list items
        const normalizedChildren = normalizeBlocks(block.children);
        // Add each child as a separate list item
        for (const child of normalizedChildren) {
          results.push({
            minimal: {
              type: blockType,
              ...(child.minimal.props ? { props: child.minimal.props } : {}),
            } as PartialBlock,
            textContent: child.textContent,
          });
        }
        continue;
      }
    }

    // Create minimal block structure with only type and props
    const minimal: PartialBlock = {
      type: blockType,
    };

    // Add props if present (but skip 'ordered' prop as it's not needed for list items)
    if (block.props && typeof block.props === 'object') {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { ordered, ...restProps } = block.props as Record<string, unknown> & { ordered?: boolean };
      if (Object.keys(restProps).length > 0) {
        minimal.props = restProps;
      }
    }

    // Recursively handle children for blocks that support it
    if (block.children && Array.isArray(block.children) && block.children.length > 0) {
      const normalizedChildren = normalizeBlocks(block.children);
      minimal.children = normalizedChildren.map(c => c.minimal);
    }

    // Extract text content separately to update after insertion
    let textContent: string | undefined;
    if ('content' in block && block.content !== undefined && block.content !== null) {
      textContent = contentToString(block.content);
    }

    results.push({ minimal, textContent });
  }

  return results;
}

/**
 * Insert blocks into the editor
 */
async function insertBlocks(
  editor: BlockNoteEditor,
  params: {
    blocks: PartialBlock[];
    position: "start" | "end" | "before" | "after";
    referenceBlockId?: string;
  },
): Promise<ToolExecutionResult> {
  const { blocks, position, referenceBlockId } = params;

  if (blocks.length === 0) {
    return { success: false, message: "No blocks provided" };
  }

  try {
    // Check if editor is editable
    if (!editor.isEditable) {
      return {
        success: false,
        message: "Editor is not in edit mode. Please enable editing first.",
      };
    }

    // Normalize blocks before inserting (two-step: minimal structure + content)
    const normalizedData = normalizeBlocks(blocks);

    // Validate normalized blocks
    if (normalizedData.length === 0) {
      return { success: false, message: "No valid blocks to insert after normalization" };
    }

    // Extract minimal blocks for insertion
    const minimalBlocks = normalizedData.map(d => d.minimal);
    const insertedBlockIds: string[] = [];

    try {
      if (position === "start") {
        // Insert at the beginning
        const firstBlock = editor.document[0];
        if (firstBlock && firstBlock.id) {
          editor.insertBlocks(minimalBlocks, firstBlock.id, "before");
        } else {
          // If document is empty, replace it
          editor.replaceBlocks(editor.document, minimalBlocks);
        }
      } else if (position === "end") {
        // Insert at the end
        const lastBlock = editor.document[editor.document.length - 1];
        if (lastBlock && lastBlock.id) {
          editor.insertBlocks(minimalBlocks, lastBlock.id, "after");
        } else {
          // If document is empty, replace it
          editor.replaceBlocks(editor.document, minimalBlocks);
        }
      } else if (position === "before" || position === "after") {
        // Insert relative to reference block
        if (!referenceBlockId) {
          return {
            success: false,
            message: "referenceBlockId required for before/after position",
          };
        }

        // Verify the reference block exists
        const refBlock = editor.getBlock(referenceBlockId);
        if (!refBlock) {
          return {
            success: false,
            message: `Reference block not found: ${referenceBlockId}`,
          };
        }

        editor.insertBlocks(minimalBlocks, referenceBlockId, position);
      }

      // Get the IDs of inserted blocks by finding new blocks in the document
      // We'll match them by finding blocks at the expected position
      const currentDoc = editor.document;
      if (position === "start") {
        insertedBlockIds.push(...currentDoc.slice(0, minimalBlocks.length).map(b => b.id));
      } else if (position === "end") {
        insertedBlockIds.push(...currentDoc.slice(-minimalBlocks.length).map(b => b.id));
      } else {
        // For before/after, find blocks around the reference
        const refIndex = currentDoc.findIndex(b => b.id === referenceBlockId);
        if (refIndex !== -1) {
          if (position === "before") {
            insertedBlockIds.push(...currentDoc.slice(refIndex, refIndex + minimalBlocks.length).map(b => b.id));
          } else {
            insertedBlockIds.push(...currentDoc.slice(refIndex + 1, refIndex + 1 + minimalBlocks.length).map(b => b.id));
          }
        }
      }

      // Step 2: Update blocks with text content
      for (let i = 0; i < insertedBlockIds.length; i++) {
        const blockId = insertedBlockIds[i];
        const textContent = normalizedData[i]?.textContent;

        if (textContent && textContent.trim()) {
          editor.updateBlock(blockId, {
            content: textContent,
          });
        }
      }
    } catch (blockInsertError) {
      console.error("[insertBlocks] BlockNote operation failed:", blockInsertError);
      console.error("[insertBlocks] Failed blocks:", JSON.stringify(minimalBlocks, null, 2));
      throw new Error(
        `Failed to insert blocks: ${blockInsertError instanceof Error ? blockInsertError.message : "Unknown error"}. The blocks may have an invalid structure.`
      );
    }

    // Describe what was inserted
    const blockDescriptions = normalizedData.map((data) => {
      const block = data.minimal;
      const type = block.type === "heading"
        ? `heading (level ${(block.props as Record<string, unknown>)?.level || 1})`
        : block.type || "block";
      return type;
    }).join(", ");

    return {
      success: true,
      message: `Inserted ${blocks.length} block(s): ${blockDescriptions}`,
    };
  } catch (error) {
    console.error("Insert blocks error:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to insert blocks",
    };
  }
}

/**
 * Update an existing block
 */
async function updateBlock(
  editor: BlockNoteEditor,
  params: { blockId: string; update: PartialBlock },
): Promise<ToolExecutionResult> {
  const { blockId, update } = params;

  try {
    const block = editor.getBlock(blockId);
    if (!block) {
      return { success: false, message: `Block not found: ${blockId}` };
    }

    // Normalize the update content - convert to string to avoid inline content issues
    const normalizedUpdate = { ...update };
    if ('content' in update && update.content !== undefined) {
      const textContent = contentToString(update.content);
      if (textContent) {
        normalizedUpdate.content = textContent;
      }
    }

    editor.updateBlock(blockId, normalizedUpdate);

    // Get the updated block to show its content
    const updatedBlock = editor.getBlock(blockId);
    const newContent = updatedBlock ? extractTextFromBlock(updatedBlock) : "";
    const contentPreview = newContent.length > 50
      ? newContent.substring(0, 50) + "..."
      : newContent;

    const blockTypeLabel = updatedBlock?.type === "heading"
      ? `heading (level ${(updatedBlock.props as Record<string, unknown>)?.level || 1})`
      : updatedBlock?.type || "block";

    return {
      success: true,
      message: contentPreview
        ? `Updated ${blockTypeLabel}: "${contentPreview}"`
        : `Updated ${blockTypeLabel}`,
    };
  } catch (error) {
    console.error("Update block error:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to update block",
    };
  }
}

/**
 * Delete blocks from the editor
 */
async function deleteBlocks(
  editor: BlockNoteEditor,
  params: { blockIds: string[] },
): Promise<ToolExecutionResult> {
  const { blockIds } = params;

  if (blockIds.length === 0) {
    return { success: false, message: "No block IDs provided" };
  }

  try {
    // Verify all blocks exist
    const missingBlocks = blockIds.filter((id) => !editor.getBlock(id));
    if (missingBlocks.length > 0) {
      return {
        success: false,
        message: `Blocks not found: ${missingBlocks.join(", ")}`,
      };
    }

    // Get block info before deletion for better message
    const blockDescriptions = blockIds.map((id) => {
      const block = editor.getBlock(id);
      if (!block) return "unknown";
      const content = extractTextFromBlock(block);
      const preview = content.length > 30 ? content.substring(0, 30) + "..." : content;
      return block.type === "heading" ? `heading: "${preview}"` : `${block.type}`;
    });

    editor.removeBlocks(blockIds);

    return {
      success: true,
      message: `Deleted ${blockIds.length} block(s): ${blockDescriptions.join(", ")}`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to delete blocks",
    };
  }
}

/**
 * Normalize text for fuzzy matching - removes punctuation and extra whitespace
 */
function normalizeTextForMatching(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

/**
 * Calculate similarity between two strings (0-1)
 * Uses a simple approach: checks if normalized query is substring of normalized content
 */
function calculateSimilarity(query: string, content: string): number {
  const normalizedQuery = normalizeTextForMatching(query);
  const normalizedContent = normalizeTextForMatching(content);

  if (normalizedContent.includes(normalizedQuery)) {
    // Exact match after normalization
    return 1.0;
  }

  // Check word overlap
  const queryWords = normalizedQuery.split(" ");
  const contentWords = normalizedContent.split(" ");
  const matchingWords = queryWords.filter(word =>
    contentWords.some(cWord => cWord.includes(word) || word.includes(cWord))
  );

  return matchingWords.length / queryWords.length;
}

/**
 * Search for blocks by content or type
 */
async function searchBlocks(
  editor: BlockNoteEditor,
  params: { query?: string; type?: string },
): Promise<ToolExecutionResult> {
  const { query, type } = params;
  const exactResults: BlockSearchResult[] = [];
  const fuzzyResults: Array<BlockSearchResult & { similarity: number }> = [];

  editor.forEachBlock((block) => {
    // Filter by type if specified
    if (type && block.type !== type) {
      return false; // Continue traversal
    }

    const content = extractTextFromBlock(block);

    // If no query specified, include all blocks (filtered by type if provided)
    if (!query) {
      exactResults.push({
        id: block.id,
        type: block.type,
        content,
        props: block.props,
        matchType: "exact",
      });
      return false;
    }

    // Try exact match first (case-insensitive substring)
    if (content.toLowerCase().includes(query.toLowerCase())) {
      exactResults.push({
        id: block.id,
        type: block.type,
        content,
        props: block.props,
        matchType: "exact",
      });
    } else {
      // Try fuzzy match
      const similarity = calculateSimilarity(query, content);
      if (similarity >= 0.6) { // Threshold for fuzzy match
        fuzzyResults.push({
          id: block.id,
          type: block.type,
          content,
          props: block.props,
          matchType: "fuzzy",
          similarity,
        });
      }
    }

    return false; // Continue traversal
  });

  // If we have exact matches, return only those
  if (exactResults.length > 0) {
    return {
      success: true,
      message: `Found ${exactResults.length} exact matching block(s)`,
      data: exactResults,
    };
  }

  // If no exact matches but we have fuzzy matches, return those sorted by similarity
  if (fuzzyResults.length > 0) {
    const sortedFuzzy = fuzzyResults.sort((a, b) => b.similarity - a.similarity);
    return {
      success: true,
      message: `No exact matches found, but found ${fuzzyResults.length} similar block(s). These blocks are close matches - please verify before updating.`,
      data: sortedFuzzy,
    };
  }

  // No matches at all
  return {
    success: true,
    message: `No matching blocks found for "${query}"${type ? ` with type "${type}"` : ""}`,
    data: [],
  };
}

/**
 * Get the full document structure
 */
async function getBlocksStructure(
  editor: BlockNoteEditor,
): Promise<ToolExecutionResult> {
  const structure: BlockStructureNode[] = [];

  function processBlock(block: Block): BlockStructureNode {
    return {
      id: block.id,
      type: block.type,
      content: extractTextFromBlock(block),
      props: block.props,
      children: block.children?.map(processBlock),
    };
  }

  editor.document.forEach((block) => {
    structure.push(processBlock(block));
  });

  return {
    success: true,
    message: `Retrieved ${structure.length} top-level block(s)`,
    data: structure,
  };
}

/**
 * Replace text across blocks
 */
async function replaceText(
  editor: BlockNoteEditor,
  params: { find: string; replace: string; blockIds?: string[] },
): Promise<ToolExecutionResult> {
  const { find, replace, blockIds } = params;
  let replacementCount = 0;

  const blocksToProcess = blockIds
    ? blockIds.map((id) => editor.getBlock(id)).filter(Boolean)
    : editor.document;

  blocksToProcess.forEach((block) => {
    if (!block) return;

    const content = extractTextFromBlock(block);
    if (content.includes(find)) {
      const newContent = content.replace(new RegExp(find, "g"), replace);
      editor.updateBlock(block.id, {
        content: newContent,
      });
      replacementCount++;
    }
  });

  return {
    success: true,
    message: `Replaced "${find}" with "${replace}" in ${replacementCount} block(s)`,
    data: { replacementCount },
  };
}

/**
 * Extract text content from a block
 */
function extractTextFromBlock(block: Block): string {
  if (!block.content || !Array.isArray(block.content)) {
    return "";
  }

  return block.content
    .map((c) => {
      if (typeof c === "string") return c;
      if (c && typeof c === "object" && "text" in c && typeof c.text === "string") {
        return c.text;
      }
      return "";
    })
    .join("");
}
