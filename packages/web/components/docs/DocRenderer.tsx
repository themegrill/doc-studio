"use client";

import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { useRouter } from "next/navigation";
import { BlockNoteView } from "@blocknote/mantine";
import {
  useCreateBlockNote,
  FormattingToolbarController,
  FormattingToolbar,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  getFormattingToolbarItems,
  LinkToolbarController,
  createReactInlineContentSpec,
  useBlockNoteEditor,
} from "@blocknote/react";
import { defaultBlockSpecs, BlockNoteSchema, defaultInlineContentSpecs } from "@blocknote/core";
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
  Crown,
  AlertTriangle,
} from "lucide-react";
import {
  VideoBlockEditorProps,
  VideoInputModal,
  VideoEmbedBlock,
  migrateVideoBlocks,
  setOpenVideoModalRef,
} from "@/components/docs/VideoEmbedBlock";
import { LinkCardBlock } from "@/components/docs/LinkCardBlock";
import { DocLinkToolbar } from "@/components/docs/DocLinkToolbar";
import { DocCreateLinkButton } from "@/components/docs/DocCreateLinkButton";
import { ImageBlockWithAlt } from "@/components/docs/ImageBlockWithAlt";
import { QuoteBlock } from "@/components/docs/QuoteBlock";
import { QuoteTypeDropdown } from "@/components/docs/QuoteTypeDropdown";
import { useSession } from "next-auth/react";
import DeleteDocumentButton from "@/components/docs/DeleteDocumentButton";
import { useEditing } from "@/contexts/EditingContext";
import { DocContextProvider } from "@/contexts/DocContext";
import ChatPanel from "@/components/chat/ChatPanel";
import { parseTitleWithBadges } from "@/lib/parse-title-badges";
import { codeBlockSpec } from "@/lib/code-block";
import { Badge } from "@/components/ui/badge-pro";
import SeoPanel from "@/components/docs/SeoPanel";
import type { SeoData } from "@/lib/db/ContentManager";
import { useAIFeatures } from "@/hooks/use-ai-features";
import { useToast } from "@/hooks/use-toast";
import GuidelinesPanel from "@/components/docs/GuidelinesPanel";
import {
  useGuidelines,
  useEditorialLint,
  useDocumentCategory,
} from "@/hooks/use-editorial";
import { DEFAULT_GUIDELINES } from "@/lib/editorial/guidelines";
import { checkImage } from "@/lib/editorial/image-check";
import { readImageInfo } from "@/lib/editorial/image-dimensions";
import {
  FINDING_FIELD_LABEL,
  type Finding,
  type LintBlock,
} from "@/lib/editorial/rules";
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
import { Plugin, PluginKey, NodeSelection } from "prosemirror-state";

// Memoized so it never re-renders when DocRenderer re-renders (no props, stable).
// Without this, AIMenuController would re-register its BlockNote handler on every render.
const MemoAIMenuController = memo(AIMenuController);

type InlineContentItem = { type: "text"; text: string; styles: Record<string, boolean> };

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

// Schema is built once at module load, not inside DocRenderer, for two reasons:
// 1. Avoids reconstructing TipTap Node objects on every render cycle.
// 2. Isolates factory/schema errors from React's render cycle so a bad spec
//    doesn't silently swallow the error inside a setState call.
// The built-in `video` block is excluded so BlockNote's FilePanelExtension
// never fires — all video content goes through the custom videoEmbed block.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { video: _builtinVideo, image: _builtinImage, quote: _builtinQuote, ...baseBlockSpecs } = defaultBlockSpecs;
const editorSchema = BlockNoteSchema.create({
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

function ProBadgeToolbarButton() {
  const editor = useBlockNoteEditor();

  const insertProBadge = () => {
    const selection = editor.prosemirrorState.selection;
    const { to } = selection;
    editor._tiptapEditor.commands.setTextSelection(to);
    editor.insertInlineContent([{ type: "proBadge" } as any]);
  };

  return (
    <button
      type="button"
      className="bn-button flex items-center gap-1 text-[11px] font-bold text-green-600 hover:text-green-700 transition-colors"
      title="Insert Pro badge"
      onMouseDown={(e) => {
        e.preventDefault();
        insertProBadge();
      }}
    >
      <Crown size={12} className="text-green-600" />
      <span>Pro</span>
    </button>
  );
}

// memo + module-level: prevents remount AND re-render when DocRenderer re-renders.
// Without memo, every DocRenderer render would re-render these, potentially causing
// BlockNote to re-register internal listeners (if getItems/formattingToolbar prop changes).
const FormattingToolbarWithAI = memo(function FormattingToolbarWithAI() {
  return (
    <FormattingToolbarController
      formattingToolbar={() => (
        <FormattingToolbar>
          {getFormattingToolbarItems().filter((item) => item.key !== "createLinkButton")}
          <QuoteTypeDropdown />
          <DocCreateLinkButton />
          <ProBadgeToolbarButton />
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
          {
            title: "Link Card",
            group: "Embeds",
            icon: <LinkIcon size={18} />,
            subtext: "Insert a styled link block",
            onItemClick: () => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { block: cursorBlock } = (editor as any).getTextCursorPosition();
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (editor as any).replaceBlocks(
                [cursorBlock],
                [{ type: "linkCard", props: { url: "", label: "" } }],
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
  slug: string;
  seo: SeoData;
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

/** Stable reference — a fresh [] each render would re-run the lint memo. */
const NO_REVIEW_FINDINGS: Finding[] = [];

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
    setGuidelineWarnings: contextSetGuidelineWarnings,
  } = editingContext;
  const { isEnabled: isFeatureEnabled } = useAIFeatures();
  const { toast } = useToast();
  const [editorState, setEditorState] = useState<EditorState>({
    isEditing: false,
    title: doc.title,
    description: doc.description || "",
    slug: doc.slug,
    seo: doc.seo || {},
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

  const [videoModalState, setVideoModalState] = useState<{
    block: VideoBlockEditorProps["block"];
    editor: VideoBlockEditorProps["editor"];
  } | null>(null);

  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // ── Editorial guidelines (DOCSTUDIO-45) ─────────────────────────────────────
  // The effective ruleset for this project, plus findings recomputed as the
  // writer types. Everything here is advisory: it never blocks a save.
  const { guidelines } = useGuidelines(projectSlug);
  // Editorial Review findings are a snapshot of the document at the moment the
  // button was pressed. Storing the state they were judged against alongside
  // them means a later edit drops them automatically — without that, the panel
  // kept showing advice naming a title the writer had already changed.
  const [review, setReview] = useState<{ key: string; findings: Finding[] } | null>(
    null,
  );
  // Bumped on every editor change so the lint memo re-reads editor.document —
  // reading it directly would return a fresh array on each render.
  const [contentVersion, setContentVersion] = useState(0);
  // uploadFile is captured once when the editor is created, so it must read the
  // guidelines through a ref rather than closing over the first loaded value.
  // Synced in an effect: writing a ref during render is a React violation, and a
  // one-render lag is irrelevant because uploads happen on user action.
  const guidelinesRef = useRef(guidelines);
  useEffect(() => {
    guidelinesRef.current = guidelines;
  }, [guidelines]);

  // Memoize title parsing to ensure consistent server/client rendering
  const parsedTitle = useMemo(() => {
    return parseTitleWithBadges(editorState.title);
  }, [editorState.title]);

  // "Pro" tag (DOCSTUDIO-24): badges are encoded in the title as HTML. We keep
  // editorState.title as the raw source of truth and drive the input from the
  // clean title, toggling this span on/off.
  const PRO_SPAN = '<span class="premium-feature">Pro</span>';
  const isPro = parsedTitle.badges.some((b) => b.variant === "pro");

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
      slug: doc.slug,
      seo: doc.seo || {},
      isEditingSectionTitle: false,
      sectionTitle: undefined,
    });
    contextSetIsEditing(false);
    contextSetIsDirty(false);
  }, [doc.title, doc.description, doc.slug, doc.seo, contextSetIsEditing, contextSetIsDirty]);

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

  // Close chat when exiting edit mode
  useEffect(() => {
    if (!editorState.isEditing) setChatOpen(false);
  }, [editorState.isEditing]);

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

    // TipTap's renderHTML strips "doc:" via isAllowedUri, producing href="" in the DOM.
    // We read doc: links from ProseMirror state (which preserves the raw attrs) and
    // then use view.domAtPos to find and patch the corresponding DOM anchor elements.
    const patchInternalLinks = () => {
      const currentEditor = editorRef.current as any;
      if (!currentEditor) return;
      const tiptap = currentEditor._tiptapEditor;
      if (!tiptap?.state || !tiptap?.view) return;
      const linkMarkType = tiptap.state.schema.marks.link;
      if (!linkMarkType) return;
      tiptap.state.doc.nodesBetween(0, tiptap.state.doc.content.size, (node: any, pos: number) => {
        if (!node.isText) return;
        const linkMark = node.marks.find((m: any) => m.type === linkMarkType);
        if (!linkMark?.attrs.href?.startsWith("doc:")) return;
        const slug = linkMark.attrs.href.slice(4);
        const href = projectSlug
          ? `/projects/${projectSlug}/docs/${slug}`
          : `/docs/${slug}`;
        try {
          const domInfo = tiptap.view.domAtPos(pos + 1);
          let el: Node | null = domInfo.node;
          if (el?.nodeType === Node.TEXT_NODE) el = el.parentElement;
          while (el && (el as Element).tagName !== "A") el = (el as Element).parentElement;
          if (el && (el as Element).tagName === "A") {
            (el as HTMLElement).setAttribute("href", href);
            (el as HTMLElement).removeAttribute("target");
            (el as HTMLElement).removeAttribute("rel");
          }
        } catch { /* skip invalid positions */ }
      });
    };

    // In ProseMirror read-only mode the browser doesn't follow <a> hrefs on a
    // plain click. Attach a delegated listener (capture phase so it fires before
    // TipTap's own handlers) that handles both doc: slugs and patched links.
    const handleDocLinkClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (href.startsWith("#")) return;
      if (href.startsWith("/")) {
        e.preventDefault();
        e.stopPropagation();
        router.push(href);
        return;
      }
      if (href.startsWith("doc:")) {
        e.preventDefault();
        e.stopPropagation();
        const slug = href.slice(4);
        router.push(projectSlug ? `/projects/${projectSlug}/docs/${slug}` : `/docs/${slug}`);
        return;
      }
      if (href.startsWith("http://") || href.startsWith("https://")) return;
      // href="" — TipTap stripped a doc: href via isAllowedUri. Look up from ProseMirror state.
      const currentEditor = editorRef.current as any;
      if (!currentEditor) return;
      const tiptap = currentEditor._tiptapEditor;
      if (!tiptap?.state || !tiptap?.view) return;
      try {
        const pos = tiptap.view.posAtDOM(anchor, 0);
        const $pos = tiptap.state.doc.resolve(pos);
        const linkMark = $pos.marks().find((m: any) => m.type.name === "link");
        if (linkMark?.attrs.href?.startsWith("doc:")) {
          e.preventDefault();
          e.stopPropagation();
          const slug = linkMark.attrs.href.slice(4);
          router.push(projectSlug ? `/projects/${projectSlug}/docs/${slug}` : `/docs/${slug}`);
        }
      } catch { /* ignore */ }
    };

    const timer = setTimeout(() => {
      addHeadingAnchors();
    //   renderImages();
      makeLinksClickable();
      patchInternalLinks();
    }, 150);

    const editorEl = document.querySelector(".bn-editor");
    editorEl?.addEventListener("click", handleDocLinkClick as EventListener, true);

    return () => {
      clearTimeout(timer);
      editorEl?.removeEventListener("click", handleDocLinkClick as EventListener, true);
    };
  }, [editorState.isEditing, doc.blocks, projectSlug, router]);

  // Enhance read-only code blocks with a header bar (language label) and a
  // copy-to-clipboard button. Only runs in view mode so BlockNote's native
  // code-block editing UI is left untouched. Mirrors the heading-anchor pattern.
  useEffect(() => {
    if (editorState.isEditing) return;

    const langById = new Map<string, string>();
    const walk = (blocks: any[]) => {
      blocks.forEach((b) => {
        if (b?.id && b?.type === "codeBlock") {
          langById.set(b.id, b.props?.language || "text");
        }
        if (b?.children?.length) walk(b.children);
      });
    };
    if (doc.blocks?.length) walk(doc.blocks as any[]);

    const copyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
    const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

    const enhanceCodeBlocks = () => {
      const blocks = document.querySelectorAll<HTMLElement>(
        '.bn-editor [data-content-type="codeBlock"]'
      );
      blocks.forEach((block) => {
        if (block.dataset.codeEnhanced) return;
        const pre = block.querySelector("pre");
        if (!pre) return;
        block.dataset.codeEnhanced = "true";

        const wrapper = block.closest<HTMLElement>("[data-id]");
        const lang = (wrapper && langById.get(wrapper.dataset.id || "")) || "text";

        const header = document.createElement("div");
        header.className = "doc-code-header";

        const label = document.createElement("span");
        label.className = "doc-code-lang";
        label.textContent = lang;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "doc-code-copy";
        btn.setAttribute("aria-label", "Copy code");
        const setLabel = (copied: boolean) => {
          btn.innerHTML = `${copied ? checkIcon : copyIcon}<span>${copied ? "Copied!" : "Copy"}</span>`;
        };
        setLabel(false);

        btn.addEventListener("click", () => {
          navigator.clipboard.writeText(pre.textContent ?? "").then(() => {
            btn.classList.add("copied");
            setLabel(true);
            setTimeout(() => {
              btn.classList.remove("copied");
              setLabel(false);
            }, 2000);
          });
        });

        header.appendChild(label);
        header.appendChild(btn);
        block.insertBefore(header, block.firstChild);
      });
    };

    const delays = [100, 300, 600, 1000];
    const timers = delays.map((d) => setTimeout(enhanceCodeBlocks, d));
    return () => timers.forEach(clearTimeout);
  }, [editorState.isEditing, doc.slug, doc.blocks]);

  // Walk an HTML DOM node and emit BlockNote inline content items.
  // Inherits `styles` from parent tags (<strong> → bold, <em> → italic, etc.)
  function walkHtmlNode(node: Node, styles: Record<string, boolean>, out: InlineContentItem[]) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text) out.push({ type: "text", text, styles: { ...styles } });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const s = { ...styles };
    switch (el.tagName.toLowerCase()) {
      case "strong": case "b":  s.bold          = true; break;
      case "em":     case "i":  s.italic        = true; break;
      case "u":                 s.underline      = true; break;
      case "s": case "del": case "strike": s.strikethrough = true; break;
      case "code":              s.code          = true; break;
    }
    el.childNodes.forEach((child) => walkHtmlNode(child, s, out));
  }

  // Convert an HTML-tagged string into an array of BlockNote inline items.
  // Falls back to stripping tags when DOMParser is unavailable (SSR guard).
  function parseInlineHtml(html: string, baseStyles: Record<string, boolean> = {}): InlineContentItem[] {
    if (typeof window === "undefined" || !window.DOMParser) {
      return [{ type: "text", text: html.replace(/<[^>]+>/g, ""), styles: baseStyles }];
    }
    try {
      const doc = new window.DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
      const out: InlineContentItem[] = [];
      doc.body.childNodes.forEach((n) => walkHtmlNode(n, baseStyles, out));
      return out.length > 0 ? out : [{ type: "text", text: html.replace(/<[^>]+>/g, ""), styles: baseStyles }];
    } catch {
      return [{ type: "text", text: html.replace(/<[^>]+>/g, ""), styles: baseStyles }];
    }
  }

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function processBlock(block: any): any {
      const processed = { ...block };

      if (Array.isArray(block.content)) {
        const newContent: unknown[] = [];
        for (const item of block.content) {
          const inline = item as { type?: string; text?: string; styles?: Record<string, boolean> };
          if (inline?.type === "text" && typeof inline.text === "string") {
            if (/\*\*|`|\*/.test(inline.text)) {
              // Markdown formatting
              newContent.push(...parseInlineMarkdown(inline.text));
            } else if (/<[a-zA-Z]/.test(inline.text)) {
              // Raw HTML tags from AI output — convert to inline content objects
              newContent.push(...parseInlineHtml(inline.text, inline.styles ?? {}));
            } else {
              newContent.push(item);
            }
          } else {
            newContent.push(item);
          }
        }
        processed.content = newContent;
      }

      // Recurse into children (e.g. nested list items)
      if (Array.isArray(block.children) && block.children.length > 0) {
        processed.children = block.children.map(processBlock);
      }

      return processed;
    }

    return blocks.map(processBlock);
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
        // A paragraph is only "empty" when every item is blank text. Link inline
        // content ({ type: "link", content: [...] }) has no top-level `.text`, so
        // without this guard a paragraph that is entirely a link would be treated
        // as empty and stripped on save — wiping the content (DOCSTUDIO-22).
        last.content.every(
          (item: unknown) =>
            (item as { type?: string })?.type !== "link" &&
            !(item as { text?: string })?.text?.trim(),
        ));
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

  const editor = useCreateBlockNote({
    initialContent: doc.blocks.length > 0 ? applyInlineMarkdownToBlocks(transformMarkdownImages(normalizeLegacyMarkdownBlocks(migrateVideoBlocks(doc.blocks)))) : undefined,
    schema: editorSchema,
    dictionary: {
      ...blockNoteLocale,
      // BlockNote shows a fixed `upload_error` string and discards whatever
      // uploadFile throws, so the writer only ever saw "Error: Upload failed".
      // State the screenshot spec on the button itself, and point at the toast
      // that carries the actual reason (DOCSTUDIO-45 §4.3).
      file_panel: {
        ...blockNoteLocale.file_panel,
        upload: {
          ...blockNoteLocale.file_panel.upload,
          file_placeholder: {
            ...blockNoteLocale.file_panel.upload.file_placeholder,
            image: `Upload image — WebP, ${DEFAULT_GUIDELINES.images.width}px wide, under ${DEFAULT_GUIDELINES.images.maxKb}KB`,
          },
          upload_error: "Upload rejected — see the message for details",
        },
      },
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
      // Screenshot compliance (DOCSTUDIO-45 §3). Checked here, before the upload
      // starts, so the writer sees every failing rule at once instead of one at
      // a time — and so a 1.4MB PNG never leaves the browser. /api/upload runs
      // the identical check as the rule of record.
      // Detect from the header rather than file.type: a dragged file often
      // arrives with an empty or generic MIME type, and skipping the check on
      // that basis let non-compliant screenshots through to the server.
      const header = new Uint8Array(
        await file.slice(0, 64 * 1024).arrayBuffer(),
      );
      const detected = readImageInfo(header);

      if (detected.format !== "unknown" && detected.format !== "svg") {
        const check = checkImage(header, file.size, guidelinesRef.current);
        if (!check.ok) {
          // The toast is the only place the writer actually reads the reason.
          toast({
            title: "Screenshot doesn't meet the guidelines",
            description: check.failures.join(" "),
            variant: "warning",
          });
          throw new Error(check.failures.join(" "));
        }
      }

      const formData = new FormData();
      formData.append("file", file);
      if (projectSlug) formData.append("projectSlug", projectSlug);

      try {
        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          // Always surface a sentence, never a bare object — the previous code
          // logged `{}` when the body had no `error` key, which told nobody
          // anything. `failures` is the per-rule list from the guideline check.
          const body = await response
            .json()
            .catch(() => ({}) as Record<string, unknown>);

          const message =
            Array.isArray(body.failures) && body.failures.length
              ? body.failures.join(" ")
              : typeof body.error === "string" && body.error
                ? body.error
                : `Upload failed (${response.status} ${response.statusText})`;

          console.error("[DocRenderer] Upload failed:", message, {
            status: response.status,
            body,
          });
          toast({
            // A rejected screenshot is a guideline miss, not a broken upload —
            // amber. Anything else genuinely failed, so keep that red.
            title:
              body.guideline === "images"
                ? "Screenshot doesn't meet the guidelines"
                : "Upload failed",
            description: message,
            variant: body.guideline === "images" ? "warning" : "destructive",
          });
          throw new Error(message);
        }

        const data = await response.json();
        return data.url;
      } catch (error) {
        console.error("[DocRenderer] Upload error:", error);
        throw error;
      }
    },
    // DOCSTUDIO-22: BlockNote's link extension opens links in a new tab on click
    // (even while editing), making links impossible to edit. A direct editorProps
    // handleClick is checked by ProseMirror BEFORE any plugin, so claiming anchor
    // clicks here (in editable mode) stops the link-open handler from running.
    // Text selection still happens on mousedown, so the cursor lands in the link
    // and the link toolbar still appears — a click now edits the link.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _tiptapOptions: {
      editorProps: {
        handleClick(view: any, _pos: any, event: any) {
          if (!view.editable) return false;
          const target = event.target as HTMLElement | null;
          return !!target?.closest?.("a");
        },
      },
    } as any,
  });

  // Update editor ref when editor is created
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Chrome-specific fix: clicking an image block triggers ProseMirror's Chrome workaround
  // (input.ts MouseDown.up) which resets NodeSelection to TextSelection when posAtCoords
  // returns inside=-1 for contentEditable=false elements. Intercepting handleClick before
  // that workaround fires and explicitly creating a NodeSelection prevents the reset.
  useEffect(() => {
    const pluginKey = new PluginKey("imageClickFix");
    const plugin = new Plugin({
      key: pluginKey,
      props: {
        handleClick(view, pos, event) {
          const target = event.target as HTMLElement;
          if (target.tagName !== "IMG" && !target.closest("img")) return false;

          const doc = view.state.doc;
          for (let testPos = Math.max(0, pos - 5); testPos <= Math.min(doc.content.size - 1, pos + 5); testPos++) {
            try {
              const $pos = doc.resolve(testPos);
              const node = $pos.nodeAfter;
              if (node && node.isAtom && NodeSelection.isSelectable(node)) {
                view.dispatch(view.state.tr.setSelection(NodeSelection.create(doc, testPos)));
                return true;
              }
            } catch {
              // skip invalid positions
            }
          }
          return false;
        },
      },
    });

    editor._tiptapEditor.registerPlugin(plugin);
    return () => {
      editor._tiptapEditor.unregisterPlugin(pluginKey);
    };
  }, [editor]);

  useEffect(() => {
    setOpenVideoModalRef((block, editor) => {
      setVideoModalState({ block, editor });
    });
    return () => {
      setOpenVideoModalRef(null);
    };
  }, []);

  // DOCSTUDIO-22: BlockNote's link hover toolbar only activates once the editor
  // has focus. On entering edit mode the editor is unfocused, so hovering a link
  // shows nothing until the user clicks into the editor. Focus the editor when
  // edit mode starts so link hover works immediately.
  useEffect(() => {
    if (!editorState.isEditing) return;
    const t = setTimeout(() => {
      try {
        editor.focus();
      } catch {
        /* editor not mounted yet */
      }
    }, 50);
    return () => clearTimeout(t);
  }, [editor, editorState.isEditing]);

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

  // Blocks as the lint rules see them. Keyed on contentVersion so it refreshes
  // when the document changes but not on unrelated re-renders.
  const lintBlocks = useMemo(
    () => editor.document as unknown as LintBlock[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, contentVersion],
  );

  // Identifies exactly what the review was run against.
  const reviewKey = `${editorState.title}\u0000${editorState.description}\u0000${
    editorState.seo.metaTitle ?? ""
  }\u0000${editorState.seo.metaDescription ?? ""}\u0000${contentVersion}`;
  const reviewFindings =
    review && review.key === reviewKey ? review.findings : NO_REVIEW_FINDINGS;

  // A section overview edits its own title; a normal document inherits the
  // section it sits under, resolved from its slug.
  const derivedCategoryTitle = useDocumentCategory(
    projectSlug,
    doc.slug,
    editorState.isEditing && !isSectionOverview,
  );
  const effectiveCategoryTitle =
    editorState.sectionTitle ?? derivedCategoryTitle;

  const { findings: editorialFindings } = useEditorialLint({
    guidelines,
    projectSlug,
    slug: editorState.slug,
    title: editorState.title,
    description: editorState.description,
    seo: editorState.seo,
    blocks: lintBlocks,
    // Section titles can carry the same badge markup document titles do, so a
    // section called "Payment & Billing Pro" would never match the approved
    // list and would warn forever (DOCSTUDIO-45 §4.2).
    categoryTitle: effectiveCategoryTitle
      ? parseTitleWithBadges(effectiveCategoryTitle).cleanTitle
      : undefined,
    extraFindings: reviewFindings,
    enabled: editorState.isEditing,
  });

  // Surface the outstanding warnings on the Publish button in the top nav, so
  // they are visible even with the Guidelines panel collapsed (DOCSTUDIO-45).
  // Prefixed with the field: messages are short and field-relative, so
  // "Not set — add one, 50–60 characters" is meaningless on its own.
  const warningMessages = useMemo(
    () =>
      editorialFindings
        .filter((f) => f.severity === "warning")
        .map((f) => `${FINDING_FIELD_LABEL[f.field]} — ${f.message}`),
    [editorialFindings],
  );

  useEffect(() => {
    contextSetGuidelineWarnings(warningMessages);
  }, [warningMessages, contextSetGuidelineWarnings]);


  useEffect(
    () => () => contextSetGuidelineWarnings([]),
    [contextSetGuidelineWarnings],
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
          projectSlug,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate title");
      }

      const data = await response.json();
      // Preserve the Pro tag (encoded in the title) across AI regeneration.
      setEditorState((prev) => ({
        ...prev,
        title: isPro ? `${data.title} ${PRO_SPAN}` : data.title,
      }));
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
          projectSlug,
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
          projectSlug,
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
      const slugChanged = currentEditorState.slug && currentEditorState.slug !== doc.slug;
      const updatedDoc = {
        slug: doc.slug,
        title: effectiveTitle,
        description: currentEditorState.description,
        blocks: normalizeLegacyMarkdownBlocks(currentEditor.document),
        published: true,
        seo: currentEditorState.seo,
        ...(slugChanged && { newSlug: currentEditorState.slug }),
      };

      const response = await fetch(`/api/docs/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedDoc),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let responseData: any = {};
      try { responseData = await response.json(); } catch { /* non-JSON body (e.g. HTML error page) */ }

      if (response.ok) {
        const savedSlug = responseData.slug || slug;
        // Immediately update the non-editor context (hides saving spinner, shows success).
        contextSetIsSaving(false);
        contextSetSaveSuccess(true);
        contextSetSaveError("");
        contextSetIsDirty(false);
        setSaveState({ isSaving: false, success: true, error: "" });

        // Defer the isEditing→false transition and navigation to the next macrotask.
        // Changing `editable` on BlockNoteView during the same React render batch that
        // resolves the save triggers a TipTap "editor view not available" error because
        // the AI/formatting extensions access editor.view during the editable transition
        // before BlockNote has re-mounted the view.  A setTimeout(0) lets React commit
        // the current render first, so BlockNote's view is stable when editable changes.
        setTimeout(() => {
          setEditorState((prev) => ({
            ...prev,
            isEditing: false,
            isEditingSectionTitle: false,
            sectionTitle: undefined,
            title: effectiveTitle,
            slug: savedSlug,
          }));
          contextSetIsEditing(false);
          if (savedSlug !== slug && projectSlug) {
            router.push(`/projects/${projectSlug}/docs/${savedSlug}`);
          }
          router.refresh();
        }, 0);

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
        seo: currentEditorState.seo,
      };

      const response = await fetch(`/api/docs/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedDoc),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let responseData: any = {};
      try { responseData = await response.json(); } catch { /* non-JSON body */ }

      if (response.ok) {
        contextSetIsSaving(false);
        contextSetSaveSuccess(true);
        contextSetSaveError("");
        contextSetIsDirty(false);
        setSaveState({ isSaving: false, success: true, error: "" });
        setTimeout(() => {
          setEditorState((prev) => ({ ...prev, isEditing: false, isEditingSectionTitle: false, sectionTitle: undefined }));
          contextSetIsEditing(false);
          router.refresh();
        }, 0);
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
    // When editable transitions true→false, BlockNote fires onChange internally.
    // Skip entirely: this isn't a user edit, so don't re-enter edit mode or mark dirty.
    if (!editorStateRef.current.isEditing && !editor.isEditable) return;

    if (!editorStateRef.current.isEditing && isAuthenticated) {
      // Bail out (return prev) if state is already editing to avoid creating
      // a new object reference that would trigger an unnecessary re-render cascade.
      setEditorState((prev) => prev.isEditing ? prev : { ...prev, isEditing: true });
      contextSetIsEditing(true);
    }
    if (isAuthenticated) contextSetIsDirty(true);

    // Let the editorial lint re-read the document (DOCSTUDIO-45).
    setContentVersion((v) => v + 1);

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
            editor.updateBlock(block, { type: "image", props: { url, caption } as any });
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

  // Reset editing state when navigating away from this doc.
  // Kept in a separate effect with empty deps so the cleanup only fires on
  // unmount — not on every dependency change — avoiding re-render cascades.
  useEffect(() => {
    return () => {
      contextSetIsEditing(false);
      contextSetIsDirty(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DocContextProvider projectSlug={projectSlug}>
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
                  value={parsedTitle.cleanTitle}
                  onChange={(e) => {
                    const clean = e.target.value;
                    setEditorState((prev) => ({
                      ...prev,
                      title: isPro ? `${clean} ${PRO_SPAN}` : clean,
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

              {/* Live title guidance (DOCSTUDIO-45 §1) — word count plus any
                  phrasing warning, with the guideline's own example as the fix. */}
              {(() => {
                const clean = parsedTitle.cleanTitle.trim();
                const words = clean ? clean.split(/\s+/).filter(Boolean).length : 0;
                const titleFindings = editorialFindings.filter(
                  (f) => f.field === "title",
                );
                const over = words > guidelines.title.maxWords;
                return (
                  <div className="space-y-0.5 -mt-1">
                    <p
                      className={`text-xs ${
                        over ? "text-amber-600" : "text-gray-400"
                      }`}
                    >
                      {words} {words === 1 ? "word" : "words"} / max{" "}
                      {guidelines.title.maxWords}
                    </p>
                    {titleFindings.map((finding) => {
                      // Warnings are rule breaches; info-level findings come from
                      // the AI review and are suggestions. They should not look
                      // identical — the old build painted both amber.
                      const isWarning = finding.severity === "warning";
                      return (
                        <div
                          key={finding.id}
                          className={`flex items-start gap-1.5 rounded px-1.5 py-1 -mx-1.5 ${
                            isWarning ? "bg-amber-50/60" : "bg-gray-50"
                          }`}
                        >
                          {isWarning ? (
                            <AlertTriangle
                              size={12}
                              className="text-amber-500 shrink-0 mt-[3px]"
                            />
                          ) : (
                            <Sparkles
                              size={12}
                              className="text-purple-400 shrink-0 mt-[3px]"
                            />
                          )}
                          <div className="min-w-0 leading-snug">
                            <p
                              className={`text-xs ${
                                isWarning ? "text-amber-700" : "text-gray-600"
                              }`}
                            >
                              {finding.message}
                            </p>
                            {finding.hint && (
                              <p className="text-[11px] text-gray-400 mt-0.5">
                                {finding.hint}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {!isSectionOverview && (
                <button
                  type="button"
                  onClick={() => {
                    setEditorState((prev) => ({
                      ...prev,
                      title: isPro
                        ? parsedTitle.cleanTitle
                        : `${parsedTitle.cleanTitle} ${PRO_SPAN}`,
                    }));
                    editingContext.setIsDirty(true);
                  }}
                  aria-pressed={isPro}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    isPro
                      ? "bg-green-500 text-white border-transparent"
                      : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                  }`}
                  title="Mark this topic as a premium (Pro) feature"
                >
                  <Crown size={14} />
                  {isPro ? "Marked as Pro" : "Mark as Pro"}
                </button>
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
              <SeoPanel
                seo={editorState.seo}
                onChange={(seo) => {
                  setEditorState((prev) => ({ ...prev, seo }));
                  editingContext.setIsDirty(true);
                }}
                docTitle={editorState.title}
                docDescription={editorState.description}
                contentPreview={documentContext.blocksPreview}
                slug={!isSectionOverview ? editorState.slug : undefined}
                onSlugChange={!isSectionOverview ? (newSlug) => {
                  setEditorState((prev) => ({ ...prev, slug: newSlug }));
                  editingContext.setIsDirty(true);
                } : undefined}
                guidelines={guidelines}
                findings={editorialFindings}
                projectSlug={projectSlug}
              />

              <GuidelinesPanel
                findings={editorialFindings}
                contentPreview={documentContext.blocksPreview}
                title={editorState.title}
                description={editorState.description}
                metaTitle={editorState.seo.metaTitle}
                metaDescription={editorState.seo.metaDescription}
                categoryTitle={effectiveCategoryTitle}
                projectSlug={projectSlug}
                onReviewFindings={(findings) =>
                  setReview({ key: reviewKey, findings })
                }
              />
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
          linkToolbar={false}
          slashMenu={false}
          onChange={handleEditorChange}
        >
          {/* Add the AI Command menu to the editor */}
          <MemoAIMenuController />
          <FormattingToolbarWithAI />
          <SuggestionMenuWithAI editor={editor} />
          <LinkToolbarController linkToolbar={DocLinkToolbar} />
        </BlockNoteView>
      </div>

      {videoModalState && (
        <VideoInputModal
          block={videoModalState.block}
          editor={videoModalState.editor}
          onClose={() => setVideoModalState(null)}
        />
      )}

      {/* Metadata */}
      {doc.updatedAt && (
        <div className="mt-8 pt-4 border-t text-sm text-gray-500">
          Last updated: {new Date(doc.updatedAt).toLocaleString()}
        </div>
      )}

      {/* AI Chat Assistant - only available in edit mode */}
      {isAuthenticated && isFeatureEnabled("chat") && editorState.isEditing && (
        <>
          {/* Keep ChatPanel mounted so conversation is preserved when toggling open/closed */}
          <div className={chatOpen ? "" : "hidden"}>
            <ChatPanel
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              editor={editor as any}
              documentContext={documentContext}
              onClose={() => setChatOpen(false)}
              onRequestEdit={() => {
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
          </div>
          {!chatOpen && (
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
    </DocContextProvider>
  );
}
