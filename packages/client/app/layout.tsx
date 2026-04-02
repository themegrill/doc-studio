import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { notFound } from "next/navigation";
import DocsLayoutClient from "@/components/docs/DocsLayoutClient";
import { getNavigation, getProject } from "@/lib/api";

export const metadata: Metadata = {
  title: "Documentation",
  description: "Documentation",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [navigation, project] = await Promise.all([getNavigation(), getProject()]);

  if (!navigation) notFound();

  return (
    <html lang="en">
      <body>
        <DocsLayoutClient navigation={navigation} logo={project?.metadata?.logo || undefined}>
          {children}
        </DocsLayoutClient>
        <Toaster />
      </body>
    </html>
  );
}
