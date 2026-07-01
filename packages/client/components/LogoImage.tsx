"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

interface LogoImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}

// Sanitize SVG: strip script tags and event-handler attributes to prevent XSS.
function sanitizeSvg(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\s+on\w+="[^"]*"/gi, "")
    .replace(/\s+on\w+='[^']*'/gi, "");
}

export default function LogoImage({ src, alt, width, height, className }: LogoImageProps) {
  const [svgContent, setSvgContent] = useState<string | null>(null);

  const isSvg = src.toLowerCase().split("?")[0].endsWith(".svg");

  useEffect(() => {
    if (!isSvg) return;
    let cancelled = false;
    fetch(src)
      .then((r) => r.text())
      .then((text) => {
        if (!cancelled) setSvgContent(sanitizeSvg(text));
      })
      .catch(() => {
        // Fetch failed — fall back to <Image> by leaving svgContent null.
      });
    return () => { cancelled = true; };
  }, [src, isSvg]);

  if (isSvg && svgContent) {
    // Inline SVG: CSS can override fill via currentColor.
    // `[&_path]:fill-current` etc. propagates the parent text color into all SVG shapes.
    return (
      <div
        className={`logo-svg ${className ?? ""} [&_svg]:h-full [&_svg]:w-auto text-gray-900 dark:text-white`}
        style={{ height: height, maxWidth: width }}
        aria-label={alt}
        role="img"
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
    );
  }

  // Non-SVG (PNG/JPG) or SVG fetch still in-flight: render as <img>.
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
    />
  );
}
