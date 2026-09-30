import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { DomainError } from "@doc-studio/core";
import { documentService, webActor } from "./service";
import { revisionParams, revisionsEnabled } from "./revisions";
export async function revisionPageContext(raw: unknown) {
	const parsed = revisionParams.safeParse(raw);
	if (!parsed.success || !revisionsEnabled(parsed.data.projectSlug))
		notFound();
	const session = await auth();
	if (!session?.user?.id) redirect("/login");
	return {
		params: parsed.data,
		actor: webActor(session.user.id),
		service: documentService(),
	};
}
export function revisionPageError(error: unknown): never {
	if (
		error instanceof DomainError &&
		["NOT_FOUND", "FORBIDDEN"].includes(error.code)
	)
		notFound();
	throw error;
}
