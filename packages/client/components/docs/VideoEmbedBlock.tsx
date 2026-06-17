"use client";

import { createReactBlockSpec } from "@blocknote/react";

function getEmbedInfo(url: string): { type: "iframe" | "video"; src: string } | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const ytWatch = trimmed.match(/(?:https?:\/\/)?(?:\w+\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([a-zA-Z0-9_-]{11})/);
  if (ytWatch) return { type: "iframe", src: `https://www.youtube.com/embed/${ytWatch[1]}` };

  const ytShort = trimmed.match(/(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (ytShort) return { type: "iframe", src: `https://www.youtube.com/embed/${ytShort[1]}` };

  const ytShorts = trimmed.match(/(?:https?:\/\/)?(?:\w+\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (ytShorts) return { type: "iframe", src: `https://www.youtube.com/embed/${ytShorts[1]}` };

  const ytEmbed = trimmed.match(/(?:https?:\/\/)?(?:\w+\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (ytEmbed) return { type: "iframe", src: `https://www.youtube.com/embed/${ytEmbed[1]}` };

  const vimeo = trimmed.match(/(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/);
  if (vimeo) return { type: "iframe", src: `https://player.vimeo.com/video/${vimeo[1]}` };

  if (/\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(trimmed)) return { type: "video", src: trimmed };

  return null;
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
    render: ({ block }) => {
      const url = block.props.url;
      const embed = url ? getEmbedInfo(url) : null;

      if (!embed) return <div />;

      return (
        <div className="my-1 w-full" contentEditable={false}>
          {embed.type === "video" ? (
            <div className="relative w-full rounded-lg overflow-hidden bg-black" style={{ paddingBottom: "56.25%" }}>
              <video controls playsInline preload="metadata" className="absolute inset-0 w-full h-full object-contain" src={embed.src} />
            </div>
          ) : (
            <div className="relative w-full rounded-lg overflow-hidden" style={{ paddingBottom: "56.25%" }}>
              <iframe className="absolute inset-0 w-full h-full border-0" src={embed.src} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen title="Embedded video" />
            </div>
          )}
        </div>
      );
    },
  }
);
