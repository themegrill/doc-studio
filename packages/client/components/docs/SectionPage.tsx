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
}

export default function SectionPage({ sectionTitle, hideTitle, childDocs }: SectionPageProps) {
  const docs = childDocs ?? [];

  return (
    <div className="max-w-[1000px] mx-auto">
      {!hideTitle && (
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">{sectionTitle}</h1>
		</div>
      )}
      {docs.length > 0 && (
		  <>
		  {hideTitle && <hr className="mb-8" />}
          <h2 className="text-2xl font-semibold mb-4">Documents in this section</h2>
        </>
      )}

      {docs.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <FolderOpen className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No documents yet</h3>
          <p className="text-gray-500">No documentation has been published in this section yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {docs.map((doc) => (
            <Link key={doc.id} href={`/${doc.slug}`} className="h-full">
              <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer flex flex-col">
                <CardHeader className="flex-1">
                  <CardTitle className="line-clamp-2 leading-snug">
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
