import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { headers } from "next/headers";
import { DocContent } from "@/lib/db/ContentManager";
import { parseTitleWithBadges } from "@/lib/parse-title-badges";
import { Badge } from "@/components/ui/badge-pro";
import Breadcrumb, { type BreadcrumbItem } from "@/components/docs/Breadcrumb";
import DocEnhancements from "@/components/docs/DocEnhancements";
import TitleCopyButton from "@/components/docs/TitleCopyButton";

async function getDocHTML(blocks: DocContent["blocks"], projectSlug?: string): Promise<string> {
  if (!blocks?.length) return "";
  const h = await headers();
  const host = h.get("host");
  const protocol = h.get("x-forwarded-proto") || "http";
  const res = await fetch(`${protocol}://${host}/api/render-doc-html`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks, projectSlug }),
    cache: "no-store",
  });
  if (!res.ok) return "";
  const { html } = await res.json();
  return html;
}

interface Props {
  doc: DocContent;
  slug: string;
  projectSlug?: string;
  breadcrumbs?: BreadcrumbItem[];
}

export default async function DocRenderer({ doc, slug, projectSlug, breadcrumbs }: Props) {
  const { cleanTitle, badges } = parseTitleWithBadges(doc.title);
  const html = await getDocHTML(doc.blocks, projectSlug);

  return (
    <div className="max-w-[1000px] mx-auto">
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumb items={breadcrumbs} />}
      {/* Title */}
      <div className="flex justify-between items-start mb-6 pb-4 border-b">
        <div className="flex-1 mr-4">
          <h1 className="text-3xl font-medium mb-2 inline group">
            {cleanTitle}
            <TitleCopyButton />
          </h1>
          {badges.map((badge, i) => (
            <Badge key={i} variant={badge.variant}>
              {badge.text}
            </Badge>
          ))}
          {doc.description && (
            <p className="text-gray-600 dark:text-gray-400">{doc.description}</p>
          )}
          {doc.updatedAt && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Last updated on{" "}
              {new Date(doc.updatedAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
          )}
        </div>
      </div>

      {/* Statically server-rendered content */}
      <style>{`
        html { scroll-behavior: smooth; }
        .bn-editor a[href] {
          color: #2563eb;
          text-decoration: underline;
          cursor: pointer;
        }
        .bn-editor a[href]:hover {
          color: #1d4ed8;
        }
        .dark .bn-editor a[href] { color: #60a5fa; }
        .dark .bn-editor a[href]:hover { color: #93c5fd; }
        .bn-editor h1, .bn-editor h2, .bn-editor h3, .bn-editor h4 {
          display: inline;
        }
        .doc-anchor-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          color: #9ca3af;
          background: none;
          border: none;
          padding: 2px;
          margin-left: 0.35em;
          border-radius: 4px;
          cursor: pointer;
          transition: opacity 0.15s, color 0.15s;
          vertical-align: middle;
          position: relative;
          top: -1px;
        }
        h1.group:hover .doc-anchor-btn,
        .bn-editor h1:hover .doc-anchor-btn,
        .bn-editor h2:hover .doc-anchor-btn,
        .bn-editor h3:hover .doc-anchor-btn,
        .bn-editor h4:hover .doc-anchor-btn {
          opacity: 1;
        }
        .doc-anchor-btn:hover {
          color: #3b82f6;
        }
        .doc-anchor-btn.copied {
          opacity: 1;
        }
        .doc-anchor-btn::after {
          content: "Copy";
          position: absolute;
          bottom: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%);
          padding: 3px 8px;
          border-radius: 5px;
          background: #1f2937;
          color: #f9fafb;
          font-size: 11px;
          font-weight: 500;
          line-height: 1.2;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.12s ease;
          z-index: 20;
        }
        .dark .doc-anchor-btn::after {
          background: #374151;
        }
        .doc-anchor-btn:hover::after {
          opacity: 1;
        }
        .doc-anchor-btn.copied::after {
          content: "Copied!";
          opacity: 1;
        }
      `}</style>
      <div className="bn-editor" dangerouslySetInnerHTML={{ __html: html }} />
      <DocEnhancements slug={slug} blocks={doc.blocks} />
    </div>
  );
}
