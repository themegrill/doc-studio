"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    $crisp: any[];
    CRISP_WEBSITE_ID: string;
  }
}

export function CrispChat({ websiteId }: { websiteId: string }) {
  useEffect(() => {
    if (!websiteId || window.$crisp) return;

    window.$crisp = [];
    window.CRISP_WEBSITE_ID = websiteId;

    const script = document.createElement("script");
    script.src = "https://client.crisp.chat/l.js";
    script.async = true;
    document.head.appendChild(script);

    return () => {
      // Clean up on unmount (e.g. hot reload) — remove script and reset globals
      script.remove();
      delete (window as any).$crisp;
      delete (window as any).CRISP_WEBSITE_ID;
    };
  }, [websiteId]);

  return null;
}
