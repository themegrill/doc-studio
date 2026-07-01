"use client";

import { useEffect } from "react";

/**
 * Injects an admin-authored raw HTML snippet (scripts, meta, link, etc.) into the
 * document head or the end of body. Scripts inserted via innerHTML do not execute,
 * so each <script> is re-created as a fresh element with its attributes and content
 * copied over. Injected nodes are removed on unmount (hot-reload safety).
 */
export function CustomCode({ code, target = "head" }: { code: string; target?: "head" | "body" }) {
  useEffect(() => {
    if (!code) return;

    const parent = target === "body" ? document.body : document.head;
    const container = document.createElement("div");
    container.innerHTML = code;

    const inserted: ChildNode[] = [];
    Array.from(container.childNodes).forEach((node) => {
      let toInsert: ChildNode = node;

      if (node.nodeName === "SCRIPT") {
        const old = node as HTMLScriptElement;
        const script = document.createElement("script");
        Array.from(old.attributes).forEach((attr) => {
          script.setAttribute(attr.name, attr.value);
        });
        script.textContent = old.textContent;
        toInsert = script;
      }

      parent.appendChild(toInsert);
      inserted.push(toInsert);
    });

    return () => {
      inserted.forEach((n) => n.remove());
    };
  }, [code, target]);

  return null;
}
