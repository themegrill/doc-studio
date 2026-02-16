"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { BlockNoteView } from "@blocknote/mantine";
import {
  useCreateBlockNote,
  FormattingToolbarController,
  FormattingToolbar,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  getFormattingToolbarItems,
} from "@blocknote/react";
import { defaultBlockSpecs } from "@blocknote/core";
import { en as blockNoteLocale } from "@blocknote/core/locales";
// @ts-expect-error - CSS imports don't have type declarations
import "@blocknote/core/fonts/inter.css";
// @ts-expect-error - CSS imports don't have type declarations
import "@blocknote/mantine/style.css";
import { DocContent } from "@/lib/db/ContentManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Link as LinkIcon,
  Sparkles,
  Loader2,
} from "lucide-react";
import { useSession } from "next-auth/react";
import DeleteDocumentButton from "@/components/docs/DeleteDocumentButton";
import { useEditing } from "@/contexts/EditingContext";
import ChatPanel from "@/components/chat/ChatPanel";
import { parseTitleWithBadges } from "@/lib/parse-title-badges";
import { Badge } from "@/components/ui/badge-pro";
import {
  AIExtension,
  AIMenuController,
  AIToolbarButton,
  getAISlashMenuItems,
} from "@blocknote/xl-ai";
import { en as aiLocale } from "@blocknote/xl-ai/locales";
import { DefaultChatTransport } from "ai";
// @ts-expect-error - CSS imports don't have type declarations
import "@blocknote/xl-ai/style.css";
import { filterSuggestionItems } from "@blocknote/core/extensions";

interface Props {
  doc: DocContent;
  slug: string;
  projectSlug?: string;
}

interface EditorState {
  isEditing: boolean;
  title: string;
  description: string;
  sectionTitle?: string;
  isEditingSectionTitle?: boolean;
}

interface SaveState {
  isSaving: boolean;
  success: boolean;
  error: string;
}

interface TitleAIState {
  isGenerating: boolean;
  error: string;
}

interface DescriptionAIState {
  isGenerating: boolean;
  error: string;
}

interface TextSelection {
  field: "title" | "description";
  text: string;
  start: number;
  end: number;
  rect: DOMRect | null;
}

interface ImproveTextState {
  isImproving: boolean;
  error: string;
}

export default function DocRenderer({ doc, slug, projectSlug }: Props) {
  const router = useRouter();
  const editingContext = useEditing();
  const [editorState, setEditorState] = useState<EditorState>({
    isEditing: false,
    title: doc.title,
    description: doc.description || "",
  });

  // Check if this is a section overview
  // A section overview is a document that represents a section itself, not just any top-level doc
  // We need to check if this document is actually used as a section in the navigation
  const isSectionOverview = false; // Disable section overview functionality for now
  // TODO: Properly implement section overview detection by checking navigation structure

  const [saveState, setSaveState] = useState<SaveState>({
    isSaving: false,
    success: false,
    error: "",
  });

  const [titleAIState, setTitleAIState] = useState<TitleAIState>({
    isGenerating: false,
    error: "",
  });

  const [descriptionAIState, setDescriptionAIState] =
    useState<DescriptionAIState>({
      isGenerating: false,
      error: "",
    });

  const [textSelection, setTextSelection] = useState<TextSelection | null>(
    null,
  );
  const [improveTextState, setImproveTextState] = useState<ImproveTextState>({
    isImproving: false,
    error: "",
  });

  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Memoize title parsing to ensure consistent server/client rendering
  const parsedTitle = useMemo(() => {
    return parseTitleWithBadges(editorState.title);
  }, [editorState.title]);

  // Use refs to store latest values without causing re-renders
  const editorStateRef = useRef(editorState);
  const editorRef = useRef<typeof editor | null>(null);

  useEffect(() => {
    editorStateRef.current = editorState;
  }, [editorState]);

  // Sync editing state with context
  useEffect(() => {
    if (editingContext.isEditing !== editorState.isEditing) {
      setEditorState((prev) => ({
        ...prev,
        isEditing: editingContext.isEditing,
        ...(editingContext.isEditing &&
          isSectionOverview && {
            isEditingSectionTitle: true,
            sectionTitle: prev.title,
          }),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingContext.isEditing]);

  const handleCancel = useCallback(() => {
    setEditorState({
      isEditing: false,
      title: doc.title,
      description: doc.description || "",
      isEditingSectionTitle: false,
      sectionTitle: undefined,
    });
    editingContext.setIsEditing(false);
  }, [doc.title, doc.description, editingContext]);

  // Initialize chat state - always start with false to match SSR
  const [chatOpen, setChatOpen] = useState(false);

  // Load chat state from localStorage after hydration
  useEffect(() => {
    const saved = localStorage.getItem("chatOpen");
    if (saved === "true") {
      setChatOpen(true);
    }
  }, []);

  // Save chat state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("chatOpen", String(chatOpen));
  }, [chatOpen]);

  // Hide selection menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Don't hide if clicking the improve button
      const target = e.target as HTMLElement;
      if (target.closest("[data-improve-button]")) {
        return;
      }
      setTextSelection(null);
    };

    if (textSelection) {
      // Use a small delay to allow the mouseup event to complete
      setTimeout(() => {
        document.addEventListener("mousedown", handleClickOutside);
      }, 100);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [textSelection]);

  // Add anchor links to headings
  useEffect(() => {
    // Only add anchors in view mode
    if (editorState.isEditing) return;

    const addHeadingAnchors = () => {
      const headings = document.querySelectorAll(
        ".bn-editor h1, .bn-editor h2, .bn-editor h3, .bn-editor h4, .bn-editor h5, .bn-editor h6",
      );

      // Early return if no headings found
      if (headings.length === 0) return;

      headings.forEach((heading) => {
        // Skip if already has anchor
        if (heading.querySelector(".heading-anchor")) return;

        const text = heading.textContent || "";
        const id = text
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

        heading.id = id;
        heading.classList.add("group", "relative");

        const anchor = document.createElement("a");
        anchor.href = `#${id}`;
        anchor.className =
          "heading-anchor absolute -left-6 top-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-600";
        anchor.innerHTML = `<svg class="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>`;
        anchor.onclick = (e) => {
          e.preventDefault();
          const url = `${window.location.origin}${window.location.pathname}#${id}`;
          navigator.clipboard.writeText(url);
          setCopiedHash(id);
          setTimeout(() => setCopiedHash(null), 2000);
          window.history.pushState(null, "", `#${id}`);
          heading.scrollIntoView({ behavior: "smooth", block: "start" });
        };

        heading.insertBefore(anchor, heading.firstChild);
      });
    };

    const renderImages = () => {
      // Find all image blocks and render them
      const editorEl = document.querySelector('.bn-editor');
      if (!editorEl) return;

      doc.blocks.forEach((block) => {
        if (block.type === 'image' && block.props?.url && block.id) {
          // Find the corresponding block element by ID (more reliable than index)
          const blockElement = editorEl.querySelector(`[data-id="${block.id}"]`);

          if (blockElement && !blockElement.classList.contains('custom-image-rendered')) {
            // Mark as rendered to avoid duplicate processing
            blockElement.classList.add('custom-image-rendered');

            // Create image element
            const imgContainer = document.createElement('div');
            imgContainer.className = 'custom-image-block';
            imgContainer.style.cssText = 'margin: 1.5rem 0; text-align: center;';

            const img = document.createElement('img');
            img.src = block.props.url;
            img.alt = block.props.caption || '';
            img.style.cssText = 'max-width: 100%; height: auto; border-radius: 0.5rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);';

            imgContainer.appendChild(img);

            if (block.props.caption) {
              const caption = document.createElement('div');
              caption.textContent = block.props.caption;
              caption.style.cssText = 'margin-top: 0.5rem; font-size: 0.875rem; color: #6b7280; font-style: italic;';
              imgContainer.appendChild(caption);
            }

            // Replace the block element with our image
            blockElement.replaceWith(imgContainer);
          }
        }
      });
    };

    const makeLinksClickable = () => {
      // Create a Set of all URLs from our blocks
      const urlsInContent = new Set<string>();
      doc.blocks.forEach(block => {
        if (block.content && Array.isArray(block.content)) {
          block.content.forEach(item => {
            if (item.href) {
              urlsInContent.add(item.href);
            }
          });
        }
      });

      // Find all text nodes in the editor
      const editorEl = document.querySelector('.bn-editor');
      if (!editorEl) {
        return;
      }

      const walker = document.createTreeWalker(
        editorEl,
        NodeFilter.SHOW_TEXT,
        null
      );

      const nodesToReplace: Array<{node: Text; url: string}> = [];
      let node: Text | null;
      let textNodesChecked = 0;

      while (node = walker.nextNode() as Text | null) {
        if (node && node.textContent) {
          textNodesChecked++;
          const text = node.textContent.trim();

          // Only match if the text node contains JUST the URL or URL with minimal surrounding text
          // Don't replace if it's part of a larger paragraph to avoid breaking content
          for (const url of urlsInContent) {
            // Only linkify if:
            // 1. Text is exactly the URL, OR
            // 2. Text contains the URL but is short (< 200 chars) to avoid breaking paragraphs
            if (text === url || (text.includes(url) && text.length < 200)) {
              // Skip if already inside a link element
              let parent = node.parentElement;
              let isInsideLink = false;
              while (parent) {
                if (parent.tagName === 'A') {
                  isInsideLink = true;
                  break;
                }
                parent = parent.parentElement;
              }

              if (!isInsideLink) {
                nodesToReplace.push({ node, url });
                break; // Only match once per node
              }
            }
          }
        }
      }

      // Replace text nodes with links (only the URL part)
      nodesToReplace.forEach(({ node, url }) => {
        const text = node.textContent || '';
        const urlIndex = text.indexOf(url);

        if (urlIndex === -1 || !node.parentNode) return;

        const parent = node.parentNode;

        // Create text before URL (if any)
        if (urlIndex > 0) {
          const beforeText = document.createTextNode(text.substring(0, urlIndex));
          parent.insertBefore(beforeText, node);
        }

        // Create the link
        const link = document.createElement('a');
        link.href = url;
        link.textContent = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'bn-content-link';
        parent.insertBefore(link, node);

        // Create text after URL (if any)
        const afterIndex = urlIndex + url.length;
        if (afterIndex < text.length) {
          const afterText = document.createTextNode(text.substring(afterIndex));
          parent.insertBefore(afterText, node);
        }

        // Remove the original text node
        parent.removeChild(node);
      });
    };

    // Run after a short delay to ensure BlockNote has rendered
    // Using a single timeout is fine - no need for polling here
    const timer = setTimeout(() => {
      addHeadingAnchors();
      renderImages();
      makeLinksClickable();
    }, 150);

    return () => clearTimeout(timer);
  }, [editorState.isEditing, doc.blocks]);

  const editor = useCreateBlockNote({
    initialContent: doc.blocks.length > 0 ? doc.blocks : undefined,
    dictionary: {
      ...blockNoteLocale,
      ai: aiLocale, // AI dictionary should be nested under 'ai' key
    },
    extensions: [
      AIExtension({
        transport: new DefaultChatTransport({
          api: "/api/ai/chat",
        }),
      }),
    ],
    uploadFile: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          console.error("[DocRenderer] Upload failed:", error);
          throw new Error(error.error || "Upload failed");
        }

        const data = await response.json();
        return data.url;
      } catch (error) {
        console.error("[DocRenderer] Upload error:", error);
        throw error;
      }
    },
  });

  // Update editor ref when editor is created
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Compute document context for AI chat
  const documentContext = useMemo(
    () => ({
      title: editorState.title,
      description: editorState.description || "",
      projectSlug: projectSlug || null,
      blocksPreview: editor.document
        .map((block) => {
          if (block.content && Array.isArray(block.content)) {
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
          return "";
        })
        .filter((text: string) => text.trim().length > 0)
        .join(" ")
        .slice(0, 2000),
    }),
    [editorState.title, editorState.description, projectSlug, editor.document],
  );

  // Formatting toolbar with the `AIToolbarButton` added
  function FormattingToolbarWithAI() {
    return (
      <FormattingToolbarController
        formattingToolbar={() => (
          <FormattingToolbar>
            {getFormattingToolbarItems()}
            {/* Add the AI button */}
            <AIToolbarButton />
          </FormattingToolbar>
        )}
      />
    );
  }
  // Slash menu with the AI option added
  function SuggestionMenuWithAI(props: { editor: typeof editor }) {
    return (
      <SuggestionMenuController
        triggerCharacter="/"
        getItems={async (query) =>
          filterSuggestionItems(
            [
              ...getDefaultReactSlashMenuItems(props.editor),
              // add the default AI slash menu items, or define your own
              ...getAISlashMenuItems(props.editor),
            ],
            query,
          )
        }
      />
    );
  }

  const handleGenerateTitle = async () => {
    setTitleAIState({ isGenerating: true, error: "" });

    try {
      // Get document content as text
      const blocks = editor.document;
      const contentPreview = blocks
        .map((block) => {
          if (block.content && Array.isArray(block.content)) {
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
          return "";
        })
        .filter((text: string) => text.trim().length > 0)
        .join(" ")
        .slice(0, 1000); // Limit to first 1000 chars

      // Call AI to generate title
      const response = await fetch("/api/ai/generate-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: contentPreview,
          currentTitle: editorState.title,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate title");
      }

      const data = await response.json();
      setEditorState((prev) => ({ ...prev, title: data.title }));
      setTitleAIState({ isGenerating: false, error: "" });
    } catch (error) {
      console.error("Error generating title:", error);
      setTitleAIState({
        isGenerating: false,
        error:
          error instanceof Error ? error.message : "Failed to generate title",
      });
    }
  };

  const handleGenerateDescription = async () => {
    setDescriptionAIState({ isGenerating: true, error: "" });

    try {
      // Get document content as text
      const blocks = editor.document;
      const contentPreview = blocks
        .map((block) => {
          if (block.content && Array.isArray(block.content)) {
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
          return "";
        })
        .filter((text: string) => text.trim().length > 0)
        .join(" ")
        .slice(0, 1000); // Limit to first 1000 chars

      // Call AI to generate description
      const response = await fetch("/api/ai/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: contentPreview,
          title: editorState.title,
          currentDescription: editorState.description,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate description");
      }

      const data = await response.json();
      setEditorState((prev) => ({ ...prev, description: data.description }));
      setDescriptionAIState({ isGenerating: false, error: "" });
    } catch (error) {
      console.error("Error generating description:", error);
      setDescriptionAIState({
        isGenerating: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate description",
      });
    }
  };

  const handleTextSelect = (
    field: "title" | "description",
    event: React.SyntheticEvent<HTMLInputElement>,
  ) => {
    const input = event.currentTarget;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const selectedText = input.value.substring(start, end);

    if (selectedText.length > 0 && start !== end) {
      const rect = input.getBoundingClientRect();

      // Calculate approximate position of selection within input
      // For better positioning, we position above the input
      setTextSelection({
        field,
        text: selectedText,
        start,
        end,
        rect,
      });
    } else {
      setTextSelection(null);
    }
  };

  const handleImproveText = async () => {
    if (!textSelection) return;

    setImproveTextState({ isImproving: true, error: "" });

    try {
      const response = await fetch("/api/ai/improve-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: textSelection.text,
          context: textSelection.field === "title" ? "title" : "description",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to improve text");
      }

      const data = await response.json();

      // Replace selected text with improved version
      const currentValue =
        textSelection.field === "title"
          ? editorState.title
          : editorState.description;

      const newValue =
        currentValue.substring(0, textSelection.start) +
        data.improvedText +
        currentValue.substring(textSelection.end);

      setEditorState((prev) => ({
        ...prev,
        [textSelection.field]: newValue,
      }));

      setTextSelection(null);
      setImproveTextState({ isImproving: false, error: "" });
    } catch (error) {
      console.error("Error improving text:", error);
      setImproveTextState({
        isImproving: false,
        error:
          error instanceof Error ? error.message : "Failed to improve text",
      });
    }
  };

  const handleSave = useCallback(async () => {
    const currentEditorState = editorStateRef.current;
    const currentEditor = editorRef.current;

    if (!currentEditor) {
      console.error("[handleSave] Editor not initialized");
      return;
    }

    editingContext.setIsSaving(true);
    editingContext.setSaveSuccess(false);
    editingContext.setSaveError("");
    setSaveState({ isSaving: true, success: false, error: "" });

    try {
      // Save section title if editing a section overview
      if (
        currentEditorState.isEditingSectionTitle &&
        isSectionOverview &&
        projectSlug
      ) {
        if (!currentEditorState.sectionTitle?.trim()) {
          setSaveState({
            isSaving: false,
            success: false,
            error: "Section title is required",
          });
          return;
        }

        const sectionResponse = await fetch(
          `/api/projects/${projectSlug}/sections/${slug}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: currentEditorState.sectionTitle }),
          },
        );

        if (!sectionResponse.ok) {
          const data = await sectionResponse.json();
          throw new Error(data.error || "Failed to update section title");
        }
      }

      // Save document content
      const updatedDoc = {
        slug: doc.slug,
        title: currentEditorState.title,
        description: currentEditorState.description,
        blocks: currentEditor.document,
      };

      const response = await fetch(`/api/docs/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedDoc),
      });

      const responseData = await response.json();

      if (response.ok) {
        setEditorState((prev) => ({
          ...prev,
          isEditing: false,
          isEditingSectionTitle: false,
          sectionTitle: undefined,
        }));
        editingContext.setIsEditing(false);
        editingContext.setIsSaving(false);
        editingContext.setSaveSuccess(true);
        editingContext.setSaveError("");
        setSaveState({ isSaving: false, success: true, error: "" });

        // Refresh the page to show updated content
        router.refresh();

        setTimeout(() => {
          setSaveState((prev) => ({ ...prev, success: false }));
          editingContext.setSaveSuccess(false);
        }, 3000);
      } else {
        console.error("[DocRenderer] Save failed:", responseData);
        const errorMsg = responseData.error || `Save failed (${response.status})`;
        editingContext.setIsSaving(false);
        editingContext.setSaveError(errorMsg);
        setSaveState({
          isSaving: false,
          success: false,
          error: errorMsg,
        });
      }
    } catch (error) {
      console.error("[DocRenderer] Save error:", error);
      const errorMsg =
        error instanceof Error
          ? error.message
          : "Save failed. Please try again.";
      editingContext.setIsSaving(false);
      editingContext.setSaveError(errorMsg);
      setSaveState({
        isSaving: false,
        success: false,
        error: errorMsg,
      });
    }
  }, [slug, projectSlug, isSectionOverview, doc.slug, router, editingContext]);

  // Register save and cancel handlers - update when they change
  useEffect(() => {
    editingContext.setOnSave(handleSave);
    editingContext.setOnCancel(handleCancel);

    return () => {
      editingContext.setOnSave(null);
      editingContext.setOnCancel(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSave, handleCancel]);

  return (
    <div className="max-w-[1000px] mx-auto">
      {/* Text Selection Improve Button */}
      {textSelection && textSelection.rect && (
        <div
          data-improve-button
          className="fixed bg-white border border-gray-200 rounded-md shadow-xl px-3 py-1.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
          style={{
            left: `${textSelection.rect.left}px`,
            top: `${textSelection.rect.top - 45}px`,
          }}
        >
          <button
            onClick={handleImproveText}
            disabled={improveTextState.isImproving}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {improveTextState.isImproving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Improving...</span>
              </>
            ) : (
              <>
                <Sparkles size={14} className="text-purple-500" />
                <span>Improve writing</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Copy Link Notification */}
      {copiedHash && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50">
          <LinkIcon size={16} />
          Link copied!
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-start mb-6 pb-4 border-b">
        <div className="flex-1 mr-4">
          {editorState.isEditing && editorState.isEditingSectionTitle ? (
            <div className="space-y-3">
              <Input
                type="text"
                value={editorState.sectionTitle || ""}
                onChange={(e) =>
                  setEditorState((prev) => ({
                    ...prev,
                    sectionTitle: e.target.value,
                  }))
                }
                className="text-3xl font-bold border-2 border-blue-200 focus:border-blue-400"
                placeholder="Section title"
              />
            </div>
          ) : editorState.isEditing ? (
            <div className="space-y-3">
              <div className="relative group">
                <Input
                  type="text"
                  value={editorState.title}
                  onChange={(e) =>
                    setEditorState((prev) => ({
                      ...prev,
                      title: e.target.value,
                    }))
                  }
                  onMouseUp={(e) => handleTextSelect("title", e)}
                  onKeyUp={(e) =>
                    handleTextSelect(
                      "title",
                      e as React.KeyboardEvent<HTMLInputElement>,
                    )
                  }
                  className="text-3xl font-bold border-2 border-blue-200 focus:border-blue-400 pr-12"
                  placeholder="Document title"
                />
                <button
                  onClick={handleGenerateTitle}
                  disabled={titleAIState.isGenerating}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Write with AI"
                  type="button"
                >
                  {titleAIState.isGenerating ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Sparkles size={16} className="text-purple-500" />
                  )}
                </button>
                {/* Tooltip */}
                <span className="absolute right-3 -top-8 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap ">
                  Write with AI
                </span>
              </div>
              {titleAIState.error && (
                <p className="text-sm text-red-600">{titleAIState.error}</p>
              )}
              <div className="relative group">
                <Input
                  type="text"
                  value={editorState.description}
                  onChange={(e) =>
                    setEditorState((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  onMouseUp={(e) => handleTextSelect("description", e)}
                  onKeyUp={(e) =>
                    handleTextSelect(
                      "description",
                      e as React.KeyboardEvent<HTMLInputElement>,
                    )
                  }
                  className="text-gray-600 border-2 border-blue-200 focus:border-blue-400 pr-12"
                  placeholder="Document description (optional)"
                />
                <button
                  onClick={handleGenerateDescription}
                  disabled={descriptionAIState.isGenerating}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Write with AI"
                  type="button"
                >
                  {descriptionAIState.isGenerating ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Sparkles size={16} className="text-purple-500" />
                  )}
                </button>
                {/* Tooltip */}
                <span className="absolute right-3 -top-8 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                  Write with AI
                </span>
              </div>
              {descriptionAIState.error && (
                <p className="text-sm text-red-600">
                  {descriptionAIState.error}
                </p>
              )}
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-bold mb-2">
                {parsedTitle.cleanTitle}
                {parsedTitle.badges.map((badge, idx) => (
                  <Badge key={`badge-${idx}`} variant={badge.variant} className="ml-3">
                    {badge.text}
                  </Badge>
                ))}
              </h1>
              {editorState.description && (
                <p className="text-gray-600">{editorState.description}</p>
              )}
            </>
          )}
        </div>

        {isAuthenticated && projectSlug && !editorState.isEditing && (
          <DeleteDocumentButton
            projectSlug={projectSlug}
            documentSlug={slug}
            documentTitle={editorState.title}
            isSectionOverview={isSectionOverview}
          />
        )}
      </div>

      {/* Editor */}
      <div
        className={`${editorState.isEditing ? "border rounded-lg p-6 bg-white" : ""}`}
      >
        <style jsx global>{`
          .bn-editor h1,
          .bn-editor h2,
          .bn-editor h3,
          .bn-editor h4,
          .bn-editor h5,
          .bn-editor h6 {
            position: relative;
            scroll-margin-top: 2rem;
          }
          .heading-anchor {
            position: absolute;
            left: -1.5rem;
            top: 0.25rem;
            opacity: 0;
            transition: opacity 0.2s;
            color: #9ca3af;
            text-decoration: none;
          }
          .heading-anchor:hover {
            color: #2563eb;
          }
          .group:hover .heading-anchor {
            opacity: 1;
          }
          /* Style links in read-only mode */
          .bn-editor a[href],
          .bn-editor .bn-content-link {
            color: #2563eb !important;
            text-decoration: underline;
            cursor: pointer;
          }
          .bn-editor a[href]:hover,
          .bn-editor .bn-content-link:hover {
            color: #1d4ed8 !important;
            text-decoration: underline;
          }
        `}</style>
        <BlockNoteView
          editor={editor}
          editable={editorState.isEditing}
          theme="light"
          formattingToolbar={false}
        >
          {/* Add the AI Command menu to the editor */}
          <AIMenuController />
          <FormattingToolbarWithAI />
          <SuggestionMenuWithAI editor={editor} />
        </BlockNoteView>
      </div>

      {/* Metadata */}
      {doc.updatedAt && (
        <div className="mt-8 pt-4 border-t text-sm text-gray-500">
          Last updated: {new Date(doc.updatedAt).toLocaleString()}
        </div>
      )}

      {/* AI Chat Assistant - Available in both edit and view mode */}
      {isAuthenticated && (
        <>
          {chatOpen ? (
            <ChatPanel
              editor={editor}
              documentContext={documentContext}
              onClose={() => setChatOpen(false)}
              onRequestEdit={() => {
                // Enable edit mode when AI needs to modify content
                setEditorState((prev) => ({
                  ...prev,
                  isEditing: true,
                  ...(isSectionOverview && {
                    isEditingSectionTitle: true,
                    sectionTitle: editorState.title,
                  }),
                }));
              }}
            />
          ) : (
            <Button
              onClick={() => setChatOpen(true)}
              className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl z-40 bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 transition-all hover:scale-110"
              title="Open AI Assistant"
            >
              <Sparkles className="h-6 w-6" />
            </Button>
          )}
        </>
      )}
    </div>
  );
}
