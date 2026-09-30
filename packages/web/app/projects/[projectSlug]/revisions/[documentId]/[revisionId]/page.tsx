import {
  revisionPageContext,
  revisionPageError,
} from "@/lib/documents/revision-pages";
import RevisionEditorClient from "@/components/docs/RevisionEditorClient";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Document revision",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{
    projectSlug: string;
    documentId: string;
    revisionId: string;
  }>;
}) {
  const ctx = await revisionPageContext(await params);
  const revision = await ctx.service
    .getRevision(
      ctx.actor,
      ctx.params.projectSlug,
      ctx.params.documentId,
      ctx.params.revisionId!,
    )
    .catch(revisionPageError);
  return (
    <RevisionEditorClient
      projectSlug={ctx.params.projectSlug}
      initial={revision}
    />
  );
}
