import type { Metadata } from "next";
import "./globals.css";
import "./mainStyle.css";
import { Toaster } from "@/components/ui/toaster";
import { notFound } from "next/navigation";
import DocsLayoutClient from "@/components/docs/DocsLayoutClient";
import { CrispChat } from "@/components/CrispChat";
import { getNavigation, getProject, getIntegrations } from "@/lib/api";
import { ThemeProvider } from "@/components/ThemeProvider";

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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved/system theme before paint to avoid a light flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('docstudio-theme');var d=t==='dark'||((!t||t==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.add(d?'dark':'light');}catch(e){}})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <DocsLayoutClient
            navigation={navigation}
            logo={project?.metadata?.logo || undefined}
            projectMetadata={project?.metadata || undefined}
          >
            {children}
          </DocsLayoutClient>
          <Toaster />
          {integrations.crispWebsiteId && (
            <CrispChat websiteId={integrations.crispWebsiteId} />
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
