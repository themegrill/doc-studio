import SessionProvider from "@/components/providers/SessionProvider";
import { Toaster } from "@/components/ui/toaster";
import { auth } from "@/lib/auth";
import type { Metadata } from "next";
import "./globals.css";
import "./mainStyle.css";

export const metadata: Metadata = {
  title: "TG Documentation",
  description: "Documentation builder for ThemeGrill",
  openGraph: {
    locale: "en_US",
    siteName: "TG Documentation",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <SessionProvider session={session}>
          {children}
          <Toaster />
        </SessionProvider>
      </body>
    </html>
  );
}
