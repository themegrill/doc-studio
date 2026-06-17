"use client";

import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

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
        <div className="py-12 text-center border-2 border-dashed rounded-lg">
          <FolderOpen className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h3 className="mb-2 text-lg font-medium text-gray-900">No documents yet</h3>
          <p className="text-gray-500">No documentation has been published in this section yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {docs.map((doc) => (
            <Link key={doc.id} href={`/${doc.slug}`} className="h-full">
              <Card className="flex flex-col h-full transition-shadow cursor-pointer hover:shadow-lg">
                <CardHeader className="flex-1">
                  <CardTitle className="leading-snug line-clamp-2">
                    {doc.title}
                  </CardTitle>
                  {doc.description && (
                    <CardDescription className="mt-2 line-clamp-2">
                      {doc.description}
                    </CardDescription>
                  )}
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
