import { notFound } from "next/navigation";
import DocsLayoutClient from "@/components/docs/DocsLayoutClient";
import { getNavigation, getProject } from "@/lib/api";

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const [navigation, project] = await Promise.all([getNavigation(), getProject()]);

  if (!navigation) notFound();

  return (
    <DocsLayoutClient navigation={navigation} logo={project?.metadata?.logo || undefined}>
      {children}
    </DocsLayoutClient>
  );
}
