"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    clarity: any;
  }
}

export function MicrosoftClarity({ projectId }: { projectId: string }) {
  useEffect(() => {
    if (!projectId || window.clarity) return;

    // Standard Microsoft Clarity loader (IIFE).
    (function (c: any, l: Document, a: string, r: string, i: string) {
      c[a] =
        c[a] ||
        function () {
          (c[a].q = c[a].q || []).push(arguments);
        };
      const t = l.createElement(r) as HTMLScriptElement;
      t.async = true;
      t.src = "https://www.clarity.ms/tag/" + i;
      const y = l.getElementsByTagName(r)[0];
      y.parentNode!.insertBefore(t, y);
    })(window, document, "clarity", "script", projectId);

    return () => {
      // Clean up on unmount (e.g. hot reload) — remove tag and reset global
      document
        .querySelectorAll(`script[src="https://www.clarity.ms/tag/${projectId}"]`)
        .forEach((el) => el.remove());
      delete (window as any).clarity;
    };
  }, [projectId]);

  return null;
}
