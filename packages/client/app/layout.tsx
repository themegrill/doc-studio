import type { Metadata } from "next";
import "./globals.css";
import "./mainStyle.css";
import { Toaster } from "@/components/ui/toaster";
import DocsLayoutClient from "@/components/docs/DocsLayoutClient";
import { CrispChat } from "@/components/CrispChat";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { MicrosoftClarity } from "@/components/MicrosoftClarity";
import { CustomCode } from "@/components/CustomCode";
import { getNavigation, getProject, getIntegrations } from "@/lib/api";
import { ThemeProvider } from "@/components/ThemeProvider";

export async function generateMetadata(): Promise<Metadata> {
  const [project, integrations] = await Promise.all([getProject(), getIntegrations()]);
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
    ...(integrations.googleSiteVerification && {
      verification: { google: integrations.googleSiteVerification },
    }),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [navigation, project, integrations] = await Promise.all([
    getNavigation(),
    getProject(),
    getIntegrations(),
  ]);

  if (!navigation) {
    return (
      <html lang="en">
        <body style={{ fontFamily: "sans-serif", padding: "2rem", textAlign: "center" }}>
          <h1>Documentation unavailable</h1>
          <p>Could not load the navigation. Please check that the API server is running.</p>
        </body>
      </html>
    );
  }

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
          {integrations.ga4MeasurementId && (
            <GoogleAnalytics measurementId={integrations.ga4MeasurementId} />
          )}
          {integrations.microsoftClarityId && (
            <MicrosoftClarity projectId={integrations.microsoftClarityId} />
          )}
          {integrations.customHeadCode && (
            <CustomCode code={integrations.customHeadCode} target="head" />
          )}
          {integrations.customBodyCode && (
            <CustomCode code={integrations.customBodyCode} target="body" />
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
