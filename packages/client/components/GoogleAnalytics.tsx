"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

export function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  useEffect(() => {
    if (!measurementId || (window as any).gtag) return;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", measurementId);

    const script = document.createElement("script");
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    script.async = true;
    document.head.appendChild(script);

    return () => {
      // Clean up on unmount (e.g. hot reload) — remove script and reset globals
      script.remove();
      delete (window as any).gtag;
      delete (window as any).dataLayer;
    };
  }, [measurementId]);

  return null;
}
