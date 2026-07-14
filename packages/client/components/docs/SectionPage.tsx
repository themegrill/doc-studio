"use client";

import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { parseTitleWithBadges } from "@/lib/parse-title-badges";
import { Badge } from "@/components/ui/badge-pro";

type ChildDoc = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  order_index?: number;
};

interface SectionPageProps {
  projectSlug: string;
  sectionSlug: string;
  sectionTitle: string;
  hideTitle?: boolean;
  childDocs?: ChildDoc[];
  sectionDescription?: string;
}

export default function SectionPage({ sectionTitle, hideTitle, childDocs }: SectionPageProps) {
  const docs = childDocs ?? [];

  return (
    <div className="max-w-[1000px] mx-auto">
      {!hideTitle && (
        <div className="mb-8">
          <h1 className="text-3xl font-medium mb-2">{sectionTitle}</h1>
		</div>
      )}
      {docs.length > 0 && (
		hideTitle && <hr className="mb-8" />
      )}
      {docs.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <FolderOpen className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No documents yet</h3>
          <p className="text-gray-500">No documentation has been published in this section yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {docs.map((doc) => {
            const { cleanTitle, badges } = parseTitleWithBadges(doc.title);
            return (
            <Link key={doc.id} href={`/${doc.slug}`} className="h-full">
              <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer flex flex-col">
                <CardHeader className="flex-1">
                  <CardTitle className="line-clamp-2 leading-snug">
                    {cleanTitle}
                    {badges.map((badge, i) => (
                      <Badge key={i} variant={badge.variant} className="text-[10px] px-1.5 py-0 shrink-0">
                        {badge.text}
                      </Badge>
                    ))}
                  </CardTitle>
                  {doc.description && (
                    <CardDescription className="mt-2 line-clamp-2">
                      {doc.description}
                    </CardDescription>
                  )}
                </CardHeader>
              </Card>
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
