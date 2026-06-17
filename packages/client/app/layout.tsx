import type { Metadata } from "next";
import "./globals.css";
import "./mainStyle.css";
import { Toaster } from "@/components/ui/toaster";
import { notFound } from "next/navigation";
import DocsLayoutClient from "@/components/docs/DocsLayoutClient";
import { CrispChat } from "@/components/CrispChat";
import { getNavigation, getProject, getIntegrations } from "@/lib/api";

export async function generateMetadata(): Promise<Metadata> {
  const project = await getProject();
  const favicon = project?.metadata?.favicon;

  return {
    title: project?.name || "Documentation",
    description: "Documentation",
    ...(favicon && {
      icons: {
        icon: favicon,
        shortcut: favicon,
        apple: favicon,
      },
    }),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [navigation, project, integrations] = await Promise.all([
    getNavigation(),
    getProject(),
    getIntegrations(),
  ]);

  if (!navigation) notFound();

  return (
    <html lang="en">
      <body>
        <DocsLayoutClient
          navigation={navigation}
          logo={project?.metadata?.logo || undefined}
          projectName={project?.name}
          navWebsite={project?.metadata?.nav_website}
          navChangelog={project?.metadata?.nav_changelog}
          navCta={project?.metadata?.nav_cta}
        >
          {children}
        </DocsLayoutClient>
        <Toaster />
        {integrations.crispWebsiteId && (
          <CrispChat websiteId={integrations.crispWebsiteId} />
        )}
      </body>
    </html>
  );
}
