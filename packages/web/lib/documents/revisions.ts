import { z } from "zod";
import { auth } from "@/lib/auth";
import { documentService, domainErrorResponse, webActor } from "./service";
import { getDb } from "@/lib/db/postgres";
import type { RevisionList, RevisionPatch } from "@doc-studio/core";

export function revisionsEnabled(projectSlug: string) {
	if (process.env.DOC_STUDIO_REVISIONS_ENABLED === "false") return false;
	const projects = process.env.DOC_STUDIO_REVISIONS_PROJECTS?.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return !projects?.length || projects.includes(projectSlug);
}
export const revisionParams = z.object({
	projectSlug: z.string().min(1),
	documentId: z.uuid(),
	revisionId: z.uuid().optional(),
});
const token = z.string().regex(/^[1-9]\d{0,18}$/);
export const createRevisionSchema = z
	.object({
		sourceRevisionId: z.uuid().optional(),
		productVersion: z.string().max(200).nullable().optional(),
		releaseNote: z.string().max(10000).nullable().optional(),
	})
	.strict();
export const patchRevisionSchema = z
	.object({
		expectedEditVersion: token,
		title: z.string().trim().min(1).max(500).optional(),
		description: z.string().max(10000).nullable().optional(),
		blocks: z.array(z.unknown()).optional(),
		seo: z.record(z.string(), z.unknown()).optional(),
		productVersion: z.string().max(200).nullable().optional(),
		releaseNote: z.string().max(10000).nullable().optional(),
	})
	.strict();
export const versionSchema = z.object({ expectedEditVersion: token }).strict();
export const readySchema = z
	.object({ expectedEditVersion: token, ready: z.boolean() })
	.strict();
export const publishSchema = z
	.object({ expectedEditVersion: token, expectedDocumentVersion: token })
	.strict();
export const privateHeaders = {
	"Cache-Control": "private, no-store",
	"X-Robots-Tag": "noindex, nofollow",
};
export function revisionJson(data: unknown, status = 200) {
	return Response.json(data, { status, headers: privateHeaders });
}
// Called only after core has authorized the list. Resolve display names for
// actors already visible in that page, without exposing user emails.
export async function withRevisionAuthors(list: RevisionList) {
	const ids = [
		...new Set(
			list.revisions
				.flatMap((r) => [r.createdBy, r.updatedBy, r.releasedBy])
				.filter((id): id is string => !!id),
		),
	];
	const sql = getDb();
	const users = ids.length
		? await sql`SELECT id, name FROM users WHERE id = ANY(${sql.array(ids)}::uuid[])`
		: [];
	const authorNames: Record<string, string> = {};
	for (const user of users)
		if (user.name) authorNames[String(user.id)] = String(user.name);
	return { ...list, authorNames };
}
export async function revisionApi(
	request: Request,
	raw: unknown,
	action:
		| "list"
		| "create"
		| "get"
		| "patch"
		| "ready"
		| "discard"
		| "publish",
) {
	try {
		const params = revisionParams.parse(raw);
		if (!revisionsEnabled(params.projectSlug))
			return revisionJson({ error: "Not found" }, 404);
		const session = await auth();
		if (!session?.user?.id)
			return revisionJson({ error: "Unauthorized" }, 401);
		const actor = webActor(session.user.id),
			service = documentService();
		const { projectSlug, documentId, revisionId } = params;
		const id = revisionId!;
		switch (action) {
			case "list": {
				const url = new URL(request.url);
				const pagination = z
					.object({
						limit: z.coerce.number().int().min(1).max(100),
						offset: z.coerce.number().int().nonnegative(),
					})
					.parse({
						limit: url.searchParams.get("limit") ?? 30,
						offset: url.searchParams.get("offset") ?? 0,
					});
				return revisionJson(
					await withRevisionAuthors(
						await service.listRevisions(
							actor,
							projectSlug,
							documentId,
							pagination,
						),
					),
				);
			}
			case "get":
				return revisionJson(
					await service.getRevision(
						actor,
						projectSlug,
						documentId,
						id,
					),
				);
			case "create":
				return revisionJson(
					await service.createRevision(
						actor,
						projectSlug,
						documentId,
						createRevisionSchema.parse(await request.json()),
					),
					201,
				);
			case "patch":
				return revisionJson(
					await service.patchRevision(
						actor,
						projectSlug,
						documentId,
						id,
						patchRevisionSchema.parse(
							await request.json(),
						) as RevisionPatch,
					),
				);
			case "ready":
				return revisionJson(
					await service.setRevisionReady(
						actor,
						projectSlug,
						documentId,
						id,
						readySchema.parse(await request.json()),
					),
				);
			case "discard":
				return revisionJson(
					await service.discardRevision(
						actor,
						projectSlug,
						documentId,
						id,
						versionSchema.parse(await request.json()),
					),
				);
			case "publish":
				return revisionJson(
					await service.publishRevision(
						actor,
						projectSlug,
						documentId,
						id,
						publishSchema.parse(await request.json()),
					),
				);
		}
	} catch (error) {
		if (error instanceof z.ZodError || error instanceof SyntaxError)
			return revisionJson({ error: "Invalid request payload" }, 400);
		const response = domainErrorResponse(error);
		for (const [name, value] of Object.entries(privateHeaders))
			response.headers.set(name, value);
		return response;
	}
}
