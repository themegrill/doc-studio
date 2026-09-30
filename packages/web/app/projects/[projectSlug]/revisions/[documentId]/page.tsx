import { withRevisionAuthors } from "@/lib/documents/revisions";
import {
  revisionPageContext,
  revisionPageError,
} from "@/lib/documents/revision-pages";
import RevisionHistoryClient from "@/components/docs/RevisionHistoryClient";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Revisions & history",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ projectSlug: string; documentId: string }>;
}) {
  const ctx = await revisionPageContext(await params);
  const data = await ctx.service
    .listRevisions(ctx.actor, ctx.params.projectSlug, ctx.params.documentId)
    .then(withRevisionAuthors)
    .catch(revisionPageError);
  return (
    <RevisionHistoryClient
      projectSlug={ctx.params.projectSlug}
      initial={data}
    />
  );
}
