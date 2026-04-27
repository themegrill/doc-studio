"use client";

import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { BlockNoteView } from "@blocknote/mantine";
import {
  useCreateBlockNote,
  FormattingToolbarController,
  FormattingToolbar,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  getFormattingToolbarItems,
  createReactBlockSpec,
} from "@blocknote/react";
import { defaultBlockSpecs, BlockNoteSchema } from "@blocknote/core";
import { en as blockNoteLocale } from "@blocknote/core/locales";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { DocContent } from "@/lib/db/ContentManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Link as LinkIcon,
  Sparkles,
  Loader2,
  Video,
  X,
} from "lucide-react";
import { useSession } from "next-auth/react";
import DeleteDocumentButton from "@/components/docs/DeleteDocumentButton";
import { useEditing } from "@/contexts/EditingContext";
import ChatPanel from "@/components/chat/ChatPanel";
import { parseTitleWithBadges } from "@/lib/parse-title-badges";
import { Badge } from "@/components/ui/badge-pro";
import { useAIFeatures } from "@/hooks/use-ai-features";
import {
  AIExtension,
  AIMenuController,
  AIToolbarButton,
  getAISlashMenuItems,
} from "@blocknote/xl-ai";
import { en as aiLocale } from "@blocknote/xl-ai/locales";
import { DefaultChatTransport } from "ai";
import "@blocknote/xl-ai/style.css";
import { filterSuggestionItems } from "@blocknote/core/extensions";

// Memoized so it never re-renders when DocRenderer re-renders (no props, stable).
// Without this, AIMenuController would re-register its BlockNote handler on every render.
const MemoAIMenuController = memo(AIMenuController);

type InlineContentItem = { type: "text"; text: string; styles: Record<string, boolean> };

function getEmbedInfo(url: string): { type: "iframe" | "video"; src: string } | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // youtube.com/watch?v=ID  (any subdomain: www, m, music)
  const ytWatch = trimmed.match(/(?:https?:\/\/)?(?:\w+\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([a-zA-Z0-9_-]{11})/);
  if (ytWatch) return { type: "iframe", src: `https://www.youtube.com/embed/${ytWatch[1]}` };

  // youtu.be/ID
  const ytShort = trimmed.match(/(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (ytShort) return { type: "iframe", src: `https://www.youtube.com/embed/${ytShort[1]}` };

  // youtube.com/shorts/ID
  const ytShorts = trimmed.match(/(?:https?:\/\/)?(?:\w+\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (ytShorts) return { type: "iframe", src: `https://www.youtube.com/embed/${ytShorts[1]}` };

  // youtube.com/embed/ID  (already an embed URL — pass through)
  const ytEmbed = trimmed.match(/(?:https?:\/\/)?(?:\w+\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (ytEmbed) return { type: "iframe", src: `https://www.youtube.com/embed/${ytEmbed[1]}` };

  // vimeo.com/ID
  const vimeo = trimmed.match(/(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/);
  if (vimeo) return { type: "iframe", src: `https://player.vimeo.com/video/${vimeo[1]}` };

  // direct video file
  if (/\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(trimmed)) return { type: "video", src: trimmed };

  return null;
}

type VideoBlockEditorProps = {
  block: { id: string; type: "videoEmbed"; props: { url: string } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any;
};

// Survives component remounts within a page session (e.g. edit↔view toggle).
// Keyed by block ID so each video block tracks its own committed URL.
const videoUrlCache = new Map<string, string>();

// Tracks which blocks currently have their input modal open.
// When BlockNote remounts a block (e.g. because editable changes), the useState
// initialiser reads from this set so the modal re-opens transparently.
const videoModalOpenCache = new Set<string>();

interface VideoInputModalProps {
  onCommit: (url: string) => void;
  onClose: () => void;
}

// Rendered via createPortal into document.body, completely outside ProseMirror's DOM.
// This sidesteps ProseMirror's native mousedown/keydown listeners on the editor root,
// which call preventDefault() on leaf nodes and block child inputs from receiving focus.
const VideoInputModal = memo(function VideoInputModal({ onCommit, onClose }: VideoInputModalProps) {
  const [inputUrl, setInputUrl] = useState("");
  const [embedError, setEmbedError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const commitUrl = () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) return;
    if (!getEmbedInfo(trimmed)) {
      setEmbedError("Unsupported URL. Paste a YouTube, Vimeo, or direct video link (.mp4, .webm…)");
      return;
    }
    onCommit(trimmed);
    onClose();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    if (file.size > 100 * 1024 * 1024) {
      setUploadError("File too large. Maximum size is 100MB.");
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Upload failed");
      }
      const { url } = await response.json();
      onCommit(url);
      onClose();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      console.error("[VideoBlock] Upload failed:", err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-xl shadow-2xl p-5 w-full max-w-md mx-4 space-y-4"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Video size={16} />
            Embed or upload a video
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2">
          <input
            autoFocus
            type="text"
            value={inputUrl}
            onChange={(e) => { setInputUrl(e.target.value); setEmbedError(""); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitUrl();
              if (e.key === "Escape") onClose();
            }}
            placeholder="Paste YouTube, Vimeo, or video URL…"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
          />
          {embedError && <p className="text-xs text-red-500">{embedError}</p>}
          <button
            onClick={commitUrl}
            disabled={!inputUrl.trim()}
            className="w-full py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg transition-colors"
          >
            Embed
          </button>
        </div>

        <div className="relative flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/ogg,video/quicktime"
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 transition-colors"
          >
            {isUploading ? "Uploading…" : "Upload a video file (max 100MB)"}
          </button>
          {uploadError && <p className="text-xs text-red-500 mt-1">{uploadError}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
});

function VideoBlockContent({ block, editor }: VideoBlockEditorProps) {
  // Always-current block ref — BlockNote may pass a new block object between renders
  // but applyUrl/clearEmbed need the latest version for updateBlock to work correctly.
  const blockRef = useRef(block);
  blockRef.current = block;

  // DO NOT use useState for the URL. Using React state creates a race condition:
  // editor.updateBlock() triggers TipTap's NodeView.update() synchronously inside
  // the ProseMirror transaction, which calls contentComponent.setRenderer() causing
  // a ContentComponent re-render BEFORE React's batch commits setDisplayUrl(url).
  // In that intermediate render displayUrl is still "" → embed is null → iframe unmounts.
  // This also fires on every selectionUpdate (TipTap calls updateProps({selected}) via rAF).
  //
  // Fix: read block.props.url directly — ProseMirror has already updated it synchronously
  // before any re-render fires, so there is never an intermediate empty-URL state.
  // The cache is a fallback for surviving NodeView remounts (e.g. when editable toggles).
  if (block.props.url) videoUrlCache.set(block.id, block.props.url);
  const currentUrl = block.props.url || videoUrlCache.get(block.id) || "";

  // Read initial modal state from the cache so it survives BlockNote remounts
  // (e.g. when editable toggles and BlockNote recreates its node views).
  const [showModal, setShowModal] = useState(() => videoModalOpenCache.has(block.id));

  // useCallback so memo on VideoInputModal actually works — without stable refs,
  // memo always fails (new function instances every render) and the modal
  // re-renders on every VideoBlockContent render, losing input focus.
  const openModal = useCallback(() => {
    videoModalOpenCache.add(blockRef.current.id);
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    videoModalOpenCache.delete(blockRef.current.id);
    setShowModal(false);
  }, []);

  const applyUrl = useCallback((url: string) => {
    videoUrlCache.set(blockRef.current.id, url);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (editor as any).updateBlock(blockRef.current, { props: { url } });
  }, [editor]);

  const clearEmbed = useCallback(() => {
    videoUrlCache.delete(blockRef.current.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (editor as any).updateBlock(blockRef.current, { props: { url: "" } });
  }, [editor]);

  const embed = getEmbedInfo(currentUrl);

  if (embed) {
    return (
      <div className="my-1 w-full" contentEditable={false}>
        {embed.type === "video" ? (
          <video controls preload="none" className="w-full rounded-lg" src={embed.src} />
        ) : (
          <div className="relative w-full rounded-lg overflow-hidden" style={{ paddingBottom: "56.25%" }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src={embed.src}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              title="Embedded video"
            />
          </div>
        )}
        {editor.isEditable && (
          <button
            onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
            onClick={clearEmbed}
            className="mt-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            Remove
          </button>
        )}
      </div>
    );
  }

  return (
    <div contentEditable={false} className="my-1 w-full">
      <div
        className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50 flex items-center gap-2 cursor-pointer hover:bg-gray-100 hover:border-gray-400 transition-colors select-none"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={() => { if (editor.isEditable) openModal(); }}
      >
        <Video size={16} className="text-gray-400 shrink-0" />
        <span className="text-sm text-gray-400">Click to embed or upload a video…</span>
      </div>
      {showModal && (
        <VideoInputModal
          onCommit={applyUrl}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

const VideoEmbedBlock = createReactBlockSpec(
  {
    type: "videoEmbed" as const,
    propSchema: {
      url: { default: "" as const },
    },
    content: "none" as const,
  },
  {
    render: (props) => (
      <VideoBlockContent
        block={props.block as VideoBlockEditorProps["block"]}
        editor={props.editor}
      />
    ),
  }
);

// memo + module-level: prevents remount AND re-render when DocRenderer re-renders.
// Without memo, every DocRenderer render would re-render these, potentially causing
// BlockNote to re-register internal listeners (if getItems/formattingToolbar prop changes).
const FormattingToolbarWithAI = memo(function FormattingToolbarWithAI() {
  return (
    <FormattingToolbarController
      formattingToolbar={() => (
        <FormattingToolbar>
          {getFormattingToolbarItems()}
          <AIToolbarButton />
        </FormattingToolbar>
      )}
    />
  );
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SuggestionMenuWithAI = memo(function SuggestionMenuWithAI({ editor }: { editor: any }) {
  // Memoize getItems so SuggestionMenuController never sees a new prop reference.
  // editor is stable (useCreateBlockNote returns the same instance).
  const getItems = useCallback(
    async (query: string) =>
      filterSuggestionItems(
        [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...getDefaultReactSlashMenuItems(editor as any).filter(
            (item: { title: string }) => item.title !== "Video",
          ),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...getAISlashMenuItems(editor as any),
          {
            title: "Video",
            group: "Embeds",
            icon: <Video size={18} />,
            subtext: "Embed or upload a video",
            onItemClick: () => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { block: cursorBlock } = (editor as any).getTextCursorPosition();
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (editor as any).replaceBlocks(
                [cursorBlock],
                [{ type: "videoEmbed", props: { url: "" } }],
              );
            },
          },
        ],
        query,
      ),
    [editor],
  );

  return (
    <SuggestionMenuController
      triggerCharacter="/"
      getItems={getItems}
    />
  );
});

interface Props {
  doc: DocContent;
  slug: string;
  projectSlug?: string;
  isSectionOverview?: boolean;
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

export default function DocRenderer({ doc, slug, projectSlug, isSectionOverview = false }: Props) {
  const router = useRouter();
  const editingContext = useEditing();
  // Destructure ALL stable setters so callbacks never depend on the editingContext object.
  // The context object reference changes on every state update (isDirty, isSaving, etc.),
  // which would cause useCallback deps to fire and recreate handlers on every change,
  // leading to an infinite cascade: handleSave recreated → useEffect re-runs → cleanup
  // calls setDraftEnabled(false) → context updates → handleSave recreated → repeat.
  // Individual setters are React useState/useCallback refs — they never change.
  const {
    setIsEditing: contextSetIsEditing,
    setIsDirty: contextSetIsDirty,
    setIsSaving: contextSetIsSaving,
    setSaveSuccess: contextSetSaveSuccess,
    setSaveError: contextSetSaveError,
    setDraftEnabled: contextSetDraftEnabled,
    setIsPublished: contextSetIsPublished,
    setOnSave: contextSetOnSave,
    setOnSaveDraft: contextSetOnSaveDraft,
    setOnCancel: contextSetOnCancel,
  } = editingContext;
  const { isEnabled: isFeatureEnabled } = useAIFeatures();
  const [editorState, setEditorState] = useState<EditorState>({
    isEditing: false,
    title: doc.title,
    description: doc.description || "",
  });

  // isSectionOverview is passed as a prop - section overview docs don't support draft mode

  const [, setSaveState] = useState<SaveState>({
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
  // Update synchronously on every render (not via useEffect) so callbacks never
  // read a stale value — useEffect fires after paint, leaving a window where
  // handleEditorChange could see isEditing=false even after state has moved to true.
  editorStateRef.current = editorState;
  const editorRef = useRef<typeof editor | null>(null);
  const isTransformingRef = useRef(false);

  // Sync editing state with context
  useEffect(() => {
    if (editingContext.isEditing !== editorState.isEditing) {
      setEditorState((prev) => ({
		...prev,
		isEditing: editingContext.isEditing,
		...(editingContext.isEditing && isSectionOverview
			? {
				isEditingSectionTitle: true,
				sectionTitle: prev.title,
			}
			: {}),
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
    contextSetIsEditing(false);
    contextSetIsDirty(false);
  }, [doc.title, doc.description, contextSetIsEditing, contextSetIsDirty]);

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

    // const renderImages = () => {
    //   // Find all image blocks and render them
    //   const editorEl = document.querySelector('.bn-editor');
    //   if (!editorEl) return;

    //   doc.blocks.forEach((block) => {
    //     if (block.type === 'image' && block.props?.url && block.id) {
    //       // Find the corresponding block element by ID (more reliable than index)
    //       const blockElement = editorEl.querySelector(`[data-id="${block.id}"]`);

    //       if (blockElement && !blockElement.classList.contains('custom-image-rendered')) {
    //         // Mark as rendered to avoid duplicate processing
    //         blockElement.classList.add('custom-image-rendered');

    //         // Create image element
    //         const imgContainer = document.createElement('div');
    //         imgContainer.className = 'custom-image-block';
    //         imgContainer.style.cssText = 'margin: 1.5rem 0; text-align: center;';

    //         const img = document.createElement('img');
    //         img.src = block.props.url;
    //         img.alt = block.props.caption || '';
    //         img.style.cssText = 'max-width: 100%; height: auto; border-radius: 0.5rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);';

    //         imgContainer.appendChild(img);

    //         if (block.props.caption) {
    //           const caption = document.createElement('div');
    //           caption.textContent = block.props.caption;
    //           caption.style.cssText = 'margin-top: 0.5rem; font-size: 0.875rem; color: #6b7280; font-style: italic;';
    //           imgContainer.appendChild(caption);
    //         }

    //         // Replace the block element with our image
    //         blockElement.replaceWith(imgContainer);
    //       }
    //     }
    //   });
    // };

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
      while (node = walker.nextNode() as Text | null) {
        if (node && node.textContent) {
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
    //   renderImages();
      makeLinksClickable();
    }, 150);

    return () => clearTimeout(timer);
  }, [editorState.isEditing, doc.blocks]);

  function parseInlineMarkdown(text: string): InlineContentItem[] {
    const result: InlineContentItem[] = [];
    const regex = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: "text", text: text.slice(lastIndex, match.index), styles: {} });
      }
      if (match[1] !== undefined) {
        result.push({ type: "text", text: match[1], styles: { bold: true } });
      } else if (match[2] !== undefined) {
        result.push({ type: "text", text: match[2], styles: { italic: true } });
      } else if (match[3] !== undefined) {
        result.push({ type: "text", text: match[3], styles: { code: true } });
      }
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      result.push({ type: "text", text: text.slice(lastIndex), styles: {} });
    }

    return result.length > 0 ? result : [{ type: "text", text, styles: {} }];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyInlineMarkdownToBlocks(blocks: any[]): any[] {
    return blocks.map((block) => {
      if (!Array.isArray(block.content)) return block;

      const newContent: unknown[] = [];
      for (const item of block.content) {
        const inline = item as { type?: string; text?: string };
        if (inline?.type === "text" && typeof inline.text === "string" && /\*\*|`|\*/.test(inline.text)) {
          newContent.push(...parseInlineMarkdown(inline.text));
        } else {
          newContent.push(item);
        }
      }

      return { ...block, content: newContent };
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function normalizeLegacyMarkdownBlocks(blocks: any[]): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const output: any[] = [];

  for (const block of blocks) {
    if (!Array.isArray(block.content)) {
      output.push(block);
      continue;
    }

    const text = block.content
      .map((item: unknown) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item && typeof (item as { text?: unknown }).text === "string") return (item as { text: string }).text;
        return "";
      })
      .join("");

    // Only transform paragraph blocks that are really markdown blobs
    if (block.type !== "paragraph" || !text.includes("\n")) {
      output.push(block);
      continue;
    }

    const lines = text.split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const imageMatch = line.match(/^!\[(.*?)\]\((.*?)\)$/);
      if (imageMatch) {
        const [, caption, url] = imageMatch;
        output.push({
          type: "image",
          props: {
            url,
            caption,
          },
        });
        continue;
      }

      const h2Match = line.match(/^##\s+(.*)$/);
      if (h2Match) {
        output.push({
          type: "heading",
          props: { level: 2 },
          content: [{ type: "text", text: h2Match[1] }],
        });
        continue;
      }

      const h1Match = line.match(/^#\s+(.*)$/);
      if (h1Match) {
        output.push({
          type: "heading",
          props: { level: 1 },
          content: [{ type: "text", text: h1Match[1] }],
        });
        continue;
      }

      const h3Match = line.match(/^###\s+(.*)$/);
      if (h3Match) {
        output.push({
          type: "heading",
          props: { level: 3 },
          content: [{ type: "text", text: h3Match[1] }],
        });
        continue;
      }

      output.push({
        type: "paragraph",
        content: parseInlineMarkdown(line),
      });
    }
  }

  // Strip trailing empty paragraphs — they show as placeholder text in the editor
  while (output.length > 0) {
    const last = output[output.length - 1];
    const isEmpty =
      last.type === "paragraph" &&
      (!Array.isArray(last.content) ||
        last.content.every((item: unknown) => !(item as { text?: string })?.text?.trim()));
    if (isEmpty) output.pop();
    else break;
  }

  return output;
}
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 function transformMarkdownImages(blocks: any[]): any[] {
  const imageRegex = /!\[(.*?)\]\((.*?)\)/g;

  return blocks.flatMap((block) => {
    if (
      block.type !== "paragraph" ||
      !Array.isArray(block.content) ||
      block.content.length === 0
    ) {
      return [block];
    }

    const fullText = block.content
      .map((item: unknown) =>
        typeof item === "string" ? item : (item as { text?: string })?.text ?? ""
      )
      .join("");

    if (!imageRegex.test(fullText)) {
      imageRegex.lastIndex = 0;
      return [block];
    }

    imageRegex.lastIndex = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = imageRegex.exec(fullText)) !== null) {
      const [fullMatch, caption, url] = match;
      const start = match.index;
      const end = start + fullMatch.length;

      const before = fullText.slice(lastIndex, start).trim();
      if (before) {
        result.push({
          type: "paragraph",
          content: [{ type: "text", text: before }],
        });
      }

      result.push({
        type: "image",
        props: {
          url,
          caption,
        },
      });

      lastIndex = end;
    }

    const after = fullText.slice(lastIndex).trim();
    if (after) {
      result.push({
        type: "paragraph",
        content: [{ type: "text", text: after }],
      });
    }

    return result.length ? result : [block];
  });
}

  // Convert legacy built-in `video` blocks to our custom `videoEmbed` blocks.
  // Built-in video blocks trigger BlockNote's FilePanelExtension when editable,
  // causing a visible flicker on edit-mode entry. videoEmbed avoids that entirely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function migrateVideoBlocks(blocks: any[]): any[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return blocks.map((block: any) => {
      if (block.type === "video" && block.props?.url) {
        return { type: "videoEmbed", props: { url: block.props.url } };
      }
      return block;
    });
  }

  const editor = useCreateBlockNote({
    initialContent: doc.blocks.length > 0 ? applyInlineMarkdownToBlocks(transformMarkdownImages(normalizeLegacyMarkdownBlocks(migrateVideoBlocks(doc.blocks)))) : undefined,
    schema: BlockNoteSchema.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      blockSpecs: { ...defaultBlockSpecs, videoEmbed: VideoEmbedBlock() } as any,
    }),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editorState.title, editorState.description, projectSlug],
    // editor.document intentionally omitted: accessing it creates a new array reference
    // on every call, defeating memoization. The preview is best-effort context for AI chat.
  );

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

    contextSetIsSaving(true);
    contextSetSaveSuccess(false);
    contextSetSaveError("");
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

      // Save document content and publish
      // When editing a section overview title, use sectionTitle as the doc title too
      // so ContentManager doesn't revert the navigation title back to the old value
      const effectiveTitle =
        currentEditorState.isEditingSectionTitle && currentEditorState.sectionTitle
          ? currentEditorState.sectionTitle
          : currentEditorState.title;
      const updatedDoc = {
        slug: doc.slug,
        title: effectiveTitle,
        description: currentEditorState.description,
        blocks: normalizeLegacyMarkdownBlocks(currentEditor.document),
        published: true,
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
          title: effectiveTitle,
        }));
        contextSetIsEditing(false);
        contextSetIsSaving(false);
        contextSetSaveSuccess(true);
        contextSetSaveError("");
        contextSetIsDirty(false);
        setSaveState({ isSaving: false, success: true, error: "" });

        // Refresh the page to show updated content
        router.refresh();

        setTimeout(() => {
          setSaveState((prev) => ({ ...prev, success: false }));
          contextSetSaveSuccess(false);
        }, 3000);
      } else {
        console.error("[DocRenderer] Save failed:", responseData);
        const errorMsg = responseData.error || `Save failed (${response.status})`;
        contextSetIsSaving(false);
        contextSetSaveError(errorMsg);
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
      contextSetIsSaving(false);
      contextSetSaveError(errorMsg);
      setSaveState({
        isSaving: false,
        success: false,
        error: errorMsg,
      });
    }
  }, [slug, projectSlug, isSectionOverview, doc.slug, router,
      contextSetIsSaving, contextSetSaveSuccess, contextSetSaveError,
      contextSetIsEditing, contextSetIsDirty]);

  const handleSaveDraft = useCallback(async () => {
    const currentEditorState = editorStateRef.current;
    const currentEditor = editorRef.current;

    if (!currentEditor) return;

    contextSetIsSaving(true);
    contextSetSaveSuccess(false);
    contextSetSaveError("");
    setSaveState({ isSaving: true, success: false, error: "" });

    try {
      const updatedDoc = {
        slug: doc.slug,
        title: currentEditorState.title,
        description: currentEditorState.description,
        blocks: normalizeLegacyMarkdownBlocks(currentEditor.document),
        published: false,
      };

      const response = await fetch(`/api/docs/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedDoc),
      });

      const responseData = await response.json();

      if (response.ok) {
        setEditorState((prev) => ({ ...prev, isEditing: false, isEditingSectionTitle: false, sectionTitle: undefined }));
        contextSetIsEditing(false);
        contextSetIsSaving(false);
        contextSetSaveSuccess(true);
        contextSetSaveError("");
        contextSetIsDirty(false);
        setSaveState({ isSaving: false, success: true, error: "" });
        router.refresh();
        setTimeout(() => {
          setSaveState((prev) => ({ ...prev, success: false }));
          contextSetSaveSuccess(false);
        }, 3000);
      } else {
        const errorMsg = responseData.error || `Save failed (${response.status})`;
        contextSetIsSaving(false);
        contextSetSaveError(errorMsg);
        setSaveState({ isSaving: false, success: false, error: errorMsg });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Save failed. Please try again.";
      contextSetIsSaving(false);
      contextSetSaveError(errorMsg);
      setSaveState({ isSaving: false, success: false, error: errorMsg });
    }
  }, [slug, doc.slug, router,
      contextSetIsSaving, contextSetSaveSuccess, contextSetSaveError,
      contextSetIsEditing, contextSetIsDirty]);

  // Stable onChange for BlockNoteView — new inline function on every render would cause
  // BlockNote to re-subscribe its listener, potentially firing onChange and cascading.
  // contextSetIsEditing/contextSetIsDirty are React state setters (stable references).
  const handleEditorChange = useCallback(() => {
    if (!editorStateRef.current.isEditing && isAuthenticated) {
      // Bail out (return prev) if state is already editing to avoid creating
      // a new object reference that would trigger an unnecessary re-render cascade.
      setEditorState((prev) => prev.isEditing ? prev : { ...prev, isEditing: true });
      contextSetIsEditing(true);
    }
    if (isAuthenticated) contextSetIsDirty(true);

    if (!isTransformingRef.current) {
      isTransformingRef.current = true;
      try {
        const imageRegex = /^!\[(.*?)\]\((.*?)\)$/;
        for (const block of editor.document) {
          if (block.type !== "paragraph" || !Array.isArray(block.content)) continue;
          const fullText = block.content
            .map((item) => (typeof item === "string" ? item : (item as { text?: string })?.text || ""))
            .join("");
          const match = fullText.match(imageRegex);
          if (match) {
            const [, caption, url] = match;
            editor.updateBlock(block, { type: "image", props: { url, caption } });
          }
        }
      } finally {
        isTransformingRef.current = false;
      }
    }
  }, [isAuthenticated, contextSetIsEditing, contextSetIsDirty, editor]);

  // Register save and cancel handlers. All setters here are stable React refs so
  // this effect only re-runs when the handlers themselves change (i.e. when route
  // props like slug change), never just because context state (isDirty, etc.) changed.
  useEffect(() => {
    contextSetDraftEnabled(!isSectionOverview);
    contextSetIsPublished(doc.published === true);
    contextSetOnSave(handleSave);
    if (!isSectionOverview) contextSetOnSaveDraft(handleSaveDraft);
    contextSetOnCancel(handleCancel);

    return () => {
      // Only clear the ref-based handlers — do NOT reset state flags like draftEnabled/
      // isPublished here. Those state setters would trigger a context update → DocRenderer
      // re-render → handleSave recreated → this effect re-runs → infinite cascade.
      contextSetOnSave(null);
      contextSetOnSaveDraft(null);
      contextSetOnCancel(null);
    };
  }, [handleSave, handleSaveDraft, handleCancel, isSectionOverview, doc.published,
      contextSetDraftEnabled, contextSetIsPublished,
      contextSetOnSave, contextSetOnSaveDraft, contextSetOnCancel]);

  return (
    <div className="max-w-[1000px] mx-auto">
      {/* Text Selection Improve Button */}
      {textSelection && textSelection.rect && isFeatureEnabled("textGeneration") && (
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
                onChange={(e) => {
                  setEditorState((prev) => ({
                    ...prev,
                    sectionTitle: e.target.value,
                  }));
                  editingContext.setIsDirty(true);
                }}
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
                  onChange={(e) => {
                    setEditorState((prev) => ({
                      ...prev,
                      title: e.target.value,
                    }));
                    editingContext.setIsDirty(true);
                  }}
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
                {isFeatureEnabled("titleGeneration") && (
                  <>
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
                  </>
                )}
              </div>
              {titleAIState.error && (
                <p className="text-sm text-red-600">{titleAIState.error}</p>
              )}
              <div className="relative group">
                <Input
                  type="text"
                  value={editorState.description}
                  onChange={(e) => {
                    setEditorState((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }));
                    editingContext.setIsDirty(true);
                  }}
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
                {isFeatureEnabled("descriptionGeneration") && (
                  <>
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
                  </>
                )}
              </div>
              {descriptionAIState.error && (
                <p className="text-sm text-red-600">
                  {descriptionAIState.error}
                </p>
              )}
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-medium mb-2">
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
              {isAuthenticated && doc.published === false && (
                <span className="inline-flex items-center mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                  Draft
                </span>
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
          onChange={handleEditorChange}
        >
          {/* Add the AI Command menu to the editor */}
          <MemoAIMenuController />
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
      {isAuthenticated && isFeatureEnabled("chat") && (
        <>
          {chatOpen ? (
            <ChatPanel
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              editor={editor as any}
              documentContext={documentContext}
              onClose={() => setChatOpen(false)}
              onRequestEdit={() => {
                // Enable edit mode when AI needs to modify content
                setEditorState((prev) => ({
                  ...prev,
                  isEditing: true,
                  ...(isSectionOverview
						? {
							isEditingSectionTitle: true,
							sectionTitle: editorState.title,
							}
						: {}),
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
