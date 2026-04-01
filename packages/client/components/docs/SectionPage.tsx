"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

type ChildDoc = {
  id: string;
  slug: string;
  title: string;
  order_index?: number;
};

interface SectionPageProps {
  projectSlug: string;
  sectionSlug: string;
  sectionTitle: string;
  childDocs?: ChildDoc[];
}

export default function SectionPage({ sectionTitle, childDocs }: SectionPageProps) {
  return (
    <div className="max-w-[1000px] mx-auto">
      <div className="mb-6 pb-4 border-b">
        <h1 className="text-3xl font-bold">{sectionTitle}</h1>
      </div>

      {childDocs && childDocs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {childDocs.map((doc) => (
            <Link key={doc.id} href={`/docs/${doc.slug}`} className="h-full">
              <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer flex flex-col">
                <CardHeader className="flex-1">
                  <CardTitle className="line-clamp-2 leading-snug text-base">
                    {doc.title}
                  </CardTitle>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
