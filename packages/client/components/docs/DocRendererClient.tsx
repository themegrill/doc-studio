"use client";

import dynamic from "next/dynamic";
import type { DocContent } from "@/lib/db/ContentManager";

// Dynamic import with no SSR
const DocRenderer = dynamic(() => import("./DocRenderer"), {
  ssr: false,
  loading: () => (
    <div className="max-w-4xl mx-auto p-8">
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded"></div>
          <div className="h-4 bg-gray-200 rounded"></div>
          <div className="h-4 bg-gray-200 rounded w-5/6"></div>
        </div>
      </div>
    </div>
  ),
});

interface Props {
  doc: DocContent;
  slug: string;
  projectSlug?: string;
}

export default function DocRendererClient({ doc, slug, projectSlug }: Props) {
  return <DocRenderer doc={doc} slug={slug} projectSlug={projectSlug} />;
}
