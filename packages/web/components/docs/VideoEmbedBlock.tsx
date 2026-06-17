"use client";

import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { createPortal } from "react-dom";
import { createReactBlockSpec } from "@blocknote/react";
import Image from "next/image";
import { Link, Video, X } from "lucide-react";
import { Label } from "@/components/ui/label";

export type VideoBlockEditorProps = {
  block: { id: string; type: "videoEmbed"; props: { url: string } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any;
};

export function getEmbedInfo(url: string): { type: "iframe" | "video"; src: string } | null {
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

export const videoUrlCache = new Map<string, string>();

let openVideoModalRef:
  | ((block: VideoBlockEditorProps["block"], editor: VideoBlockEditorProps["editor"]) => void)
  | null = null;

export function setOpenVideoModalRef(
  fn: ((block: VideoBlockEditorProps["block"], editor: VideoBlockEditorProps["editor"]) => void) | null,
) {
  openVideoModalRef = fn;
}

interface VideoInputModalProps {
  block: VideoBlockEditorProps["block"];
  editor: VideoBlockEditorProps["editor"];
  onClose: () => void;
}

export const VideoInputModal = memo(function VideoInputModal({
  block,
  editor,
  onClose,
}: VideoInputModalProps) {
  const [inputUrl, setInputUrl] = useState("");
  const [embedError, setEmbedError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const commitUrl = useCallback(() => {
    const trimmed = inputUrl.trim();
    if (!trimmed) return;

    const embedInfo = getEmbedInfo(trimmed);
    if (!embedInfo) {
      setEmbedError(
        "Unsupported URL. Paste a YouTube, Vimeo, or direct video link (.mp4, .webm…)",
      );
      return;
    }

    videoUrlCache.set(block.id, trimmed);
    editor.updateBlock(block, { props: { url: trimmed } });
    onClose();
  }, [inputUrl, block, editor, onClose]);

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

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Upload failed");
      }

      const { url } = await response.json();
      videoUrlCache.set(block.id, url);
      editor.updateBlock(block, { props: { url } });
      onClose();
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Upload failed. Please try again.",
      );
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
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
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
            onChange={(e) => {
              setInputUrl(e.target.value);
              setEmbedError("");
            }}
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

          {uploadError && (
            <p className="text-xs text-red-500 mt-1">{uploadError}</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
});

function VideoBlockContent({ block, editor }: VideoBlockEditorProps) {
  const blockRef = useRef(block);
  useEffect(() => { blockRef.current = block; });

  const currentUrl = block.props.url || videoUrlCache.get(block.id) || "";

  useEffect(() => {
    if (block.props.url) videoUrlCache.set(block.id, block.props.url);
  }, [block.id, block.props.url]);

  const clearEmbed = useCallback(() => {
    const id = blockRef.current.id;
    videoUrlCache.delete(id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (editor as any).updateBlock(blockRef.current, { props: { url: "" } });
  }, [editor]);

  const embed = useMemo(() => getEmbedInfo(currentUrl), [currentUrl]);

  const ytId = embed?.src.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/)?.[1] ?? null;
  const isVimeo = embed?.src.includes("player.vimeo.com") ?? false;
  const platform = ytId ? "YouTube" : isVimeo ? "Vimeo" : "Video";
  const thumbnail = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null;

  if (embed) {
    return (
      <div className="my-1 w-full" contentEditable={false}>
		{editor.isEditable ? (
			<div className="flex border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white h-20">
				<div className="relative w-32 flex-shrink-0 bg-gray-900 flex items-center justify-center overflow-hidden">
					{thumbnail
						? <Image src={thumbnail} alt="" fill className="object-cover" />
						: <Video size={20} className="text-white/40" />
					}
					<div className="absolute inset-0 flex items-center justify-center bg-black/20">
						<div className="w-7 h-7 bg-white/90 rounded-full flex items-center justify-center shadow">
							<svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 ml-0.5 text-gray-800"><polygon points="5,3 19,12 5,21" /></svg>
						</div>
					</div>
				</div>
				<div className="flex items-center px-4 min-w-0">
					<div className="min-w-0">
						<div className="flex items-center gap-2 mb-1">
							<span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{platform}</span>
							<span className="text-xs text-gray-400">Video ready</span>
						</div>
						<p className="text-xs text-gray-400 truncate max-w-xs">
							<a href={embed.src} target="_blank" rel="noopener noreferrer" className="text-xs hover:text-blue-500 hover:underline">
								<Link size={12} className="inline-block mr-1" />
							{embed.src}
							</a>
						</p>
					</div>
				</div>
			</div>
		) : (
			embed.type === "video" ? (
          <div
            key={embed.src}
            className="relative w-full rounded-lg overflow-hidden bg-black"
            style={{ paddingBottom: "56.25%" }}
          >
            <video
              controls
              playsInline
              preload="metadata"
              className="absolute inset-0 w-full h-full object-contain"
              src={embed.src}
            />
          </div>
        ) : (
          <div
            key={embed.src}
            className="relative w-full rounded-lg overflow-hidden"
            style={{ paddingBottom: "56.25%" }}
          >
            <iframe
              className="absolute inset-0 w-full h-full border-0"
              src={embed.src}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              title="Embedded video"
            />
          </div>
        )
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
        onClick={() => {
          if (editor.isEditable) {
            openVideoModalRef?.(blockRef.current, editor);
          }
        }}
      >
        <Video size={16} className="text-gray-400 shrink-0" />
        <span className="text-sm text-gray-400">Click to embed or upload a video…</span>
      </div>
    </div>
  );
}

export const VideoEmbedBlock = createReactBlockSpec(
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

// Converts all built-in `video` blocks to the custom `videoEmbed` block type.
// Must migrate ALL video blocks regardless of URL — a block with url: "" still
// needs to be videoEmbed so it renders the custom placeholder instead of
// BlockNote's FilePanelExtension dialog.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateVideoBlocks(blocks: any[]): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return blocks.map((block: any) => {
    if (block.type === "video") {
      return {
        type: "videoEmbed",
        props: { url: block.props?.url ?? "" },
        ...(block.id ? { id: block.id } : {}),
        ...(block.children?.length ? { children: migrateVideoBlocks(block.children) } : {}),
      };
    }
    if (block.children?.length) {
      return { ...block, children: migrateVideoBlocks(block.children) };
    }
    return block;
  });
}
