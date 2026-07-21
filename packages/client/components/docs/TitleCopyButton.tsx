"use client";

import { useRef } from "react";

export default function TitleCopyButton() {
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={btnRef}
      aria-label="Copy link to this doc"
      className="doc-anchor-btn"
      onClick={() => {
        const url = `${window.location.origin}${window.location.pathname}`;
        navigator.clipboard.writeText(url).then(() => {
          btnRef.current?.classList.add("copied");
          setTimeout(() => btnRef.current?.classList.remove("copied"), 2000);
        });
      }}
      dangerouslySetInnerHTML={{
        __html: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
      }}
    />
  );
}
