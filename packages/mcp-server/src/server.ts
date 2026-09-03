import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
	DocumentService,
	DomainError,
	type ActorContext,
	type SeoData,
} from "@doc-studio/core";

const project = z.object({
	projectSlug: z.string().min(1).describe("Stable project slug"),
});
const docRef = project.extend({ documentId: z.uuid() });
const placement = {
	position: z.int().nonnegative().optional(),
	beforeDocumentId: z.uuid().optional(),
	afterDocumentId: z.uuid().optional(),
};
const slugSegment = z
	.string()
	.min(1)
	.max(100)
	.regex(
		/^[a-z0-9]+(?:-[a-z0-9]+)*$/,
		"Use lowercase letters, numbers, and single hyphens only",
	);
const scalar = z.union([
	z.string().max(100_000),
	z.number().finite(),
	z.boolean(),
	z.null(),
]);
const props = z
	.record(z.string().max(64), scalar)
	.refine(
		(value) => Object.keys(value).length <= 100,
		"Too many block props",
	);
const textContent = z
	.object({
		type: z.literal("text"),
		text: z.string().max(100_000),
		styles: z.record(z.string().max(64), scalar).optional(),
	})
	.strict();
const linkContent = z
	.object({
		type: z.literal("link"),
		href: z.string().max(2_048),
		content: z.array(textContent).max(1_000),
	})
	.strict();
const inlineContent = z.union([
	z.string().max(100_000),
	textContent,
	linkContent,
]);
type BlockInput = {
	id: string;
	type: string;
	props?: Record<string, unknown>;
	content?: unknown[];
	children?: BlockInput[];
};
const block: z.ZodType<BlockInput> = z.lazy(() =>
	z
		.object({
			id: z.string().min(1).max(128),
			type: z.string().min(1).max(64),
			props: props.optional(),
			content: z.array(inlineContent).max(5_000).optional(),
			children: z.array(block).max(500).optional(),
		})
		.strict(),
);
const robots = z.object({
	index: z.boolean().optional(),
	follow: z.boolean().optional(),
	maxSnippet: z.number().int().optional(),
	maxVideoPreview: z.number().int().optional(),
	maxImagePreview: z.enum(["none", "standard", "large"]).optional(),
});
const sitemap = z.object({
	include: z.boolean().optional(),
	priority: z.number().min(0).max(1).optional(),
	changeFrequency: z
		.enum([
			"always",
			"hourly",
			"daily",
			"weekly",
			"monthly",
			"yearly",
			"never",
		])
		.optional(),
});
const seo = z
	.object({
		metaTitle: z.string().max(500).optional(),
		metaDescription: z.string().max(1000).optional(),
		schemaType: z
			.enum(["Article", "TechArticle", "HowTo", "FAQPage"])
			.optional(),
		canonicalUrl: z.url().max(2_048).optional(),
		robots: robots.optional(),
		ogTitle: z.string().max(500).optional(),
		ogDescription: z.string().max(1_000).optional(),
		ogImage: z.url().max(2_048).optional(),
		ogImageAlt: z.string().max(500).optional(),
		twitterCard: z.enum(["summary", "summary_large_image"]).optional(),
		sitemap: sitemap.optional(),
		focusKeyword: z.string().max(200).optional(),
	})
	.strict();

function ok(value: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(value) }],
		structuredContent: { result: value },
	};
}
function failure(error: unknown) {
	const known = error instanceof DomainError;
	const body = {
		code: known ? error.code : "INTERNAL_ERROR",
		message: known ? error.message : "Operation failed",
		...(known && error.details ? { details: error.details } : {}),
	};
	if (!known) console.error(error);
	return {
		content: [{ type: "text" as const, text: JSON.stringify(body) }],
		structuredContent: { error: body },
		isError: true as const,
	};
}
const run = <T>(fn: () => Promise<T> | T) =>
	Promise.resolve().then(fn).then(ok, failure);

export function buildServer(service: DocumentService, actor: ActorContext) {
	const server = new McpServer(
		{ name: "doc-studio", version: "0.1.0" },
		{
			instructions:
				"Use project slugs for project scope and stable document UUIDs for mutations. Read a document before updating it and pass expectedUpdatedAt when possible. Destructive purge requires a preview token.",
		},
	);
	const tool = (
		name: string,
		title: string,
		description: string,
		inputSchema: z.ZodType,
		handler: (args: any) => Promise<unknown> | unknown,
		annotations: Record<string, boolean> = {},
	) =>
		server.registerTool(
			name,
			{
				title,
				description,
				inputSchema,
				outputSchema: z.object({ result: z.unknown() }),
				annotations,
			},
			(args) => run(() => handler(args)),
		);

	tool(
		"projects_list",
		"List projects",
		"List projects visible to the configured actor.",
		z.object({}),
		() => service.listProjects(actor),
		{ readOnlyHint: true },
	);
	tool(
		"projects_get",
		"Get project",
		"Get one project by slug.",
		project,
		(a) => service.getProject(actor, a.projectSlug),
		{ readOnlyHint: true },
	);
	tool(
		"docs_list",
		"List documents",
		"List draft, published, or trashed documents without their blocks.",
		project.extend({
			published: z.boolean().optional(),
			includeTrash: z.boolean().default(false),
			section: z.string().optional(),
			limit: z.int().min(1).max(200).default(100),
			offset: z.int().nonnegative().default(0),
		}),
		(a) => service.listDocuments(actor, a.projectSlug, a),
		{ readOnlyHint: true },
	);
	tool(
		"docs_get",
		"Get document",
		"Get a live document by UUID or project-scoped slug; includeTrash also requires delete scope.",
		project
			.extend({
				documentId: z.uuid().optional(),
				slug: z.string().optional(),
				includeBlocks: z.boolean().default(true),
				includeTrash: z.boolean().default(false),
			})
			.refine(
				(a) => !!a.documentId !== !!a.slug,
				"Provide exactly one of documentId or slug",
			),
		(a) =>
			service.getDocument(
				actor,
				a.projectSlug,
				a,
				a.includeBlocks,
				a.includeTrash,
			),
		{ readOnlyHint: true },
	);
	tool(
		"docs_create",
		"Create document",
		"Create a document in a section at an exact placement.",
		project
			.extend({
				title: z.string().min(1).max(500),
				slug: slugSegment,
				section: z.string().min(1).max(128),
				description: z.string().max(10_000).optional(),
				blocks: z.array(block).max(500).optional(),
				seo: seo.optional(),
				published: z.boolean().default(false),
				...placement,
			})
			.refine(
				(a) =>
					[
						a.position !== undefined,
						!!a.beforeDocumentId,
						!!a.afterDocumentId,
					].filter(Boolean).length <= 1,
				"Provide at most one placement selector",
			),
		(a) => service.createDocument(actor, a.projectSlug, a),
	);
	tool(
		"docs_update",
		"Update document",
		"Patch only title, description, or BlockNote blocks. Omitted fields are preserved.",
		docRef.extend({
			title: z.string().min(1).max(500).optional(),
			description: z.string().max(10_000).nullable().optional(),
			blocks: z.array(block).max(500).optional(),
			expectedUpdatedAt: z.iso.datetime().optional(),
		}),
		(a) => service.updateDocument(actor, a.projectSlug, a.documentId, a),
	);
	tool(
		"docs_rename",
		"Rename document URL",
		"Change the local URL slug and maintain redirects.",
		docRef.extend({ slug: slugSegment }),
		(a) =>
			service.renameDocument(actor, a.projectSlug, a.documentId, a.slug),
	);
	tool(
		"docs_publish",
		"Publish document",
		"Make a document public.",
		docRef,
		(a) => service.setPublished(actor, a.projectSlug, a.documentId, true),
	);
	tool(
		"docs_unpublish",
		"Unpublish document",
		"Return a document to draft state.",
		docRef,
		(a) => service.setPublished(actor, a.projectSlug, a.documentId, false),
	);
	tool(
		"docs_move",
		"Move document",
		"Move a document to another section and maintain its URL redirect.",
		docRef
			.extend({ targetSection: z.string().min(1), ...placement })
			.refine(
				(a) =>
					[
						a.position !== undefined,
						!!a.beforeDocumentId,
						!!a.afterDocumentId,
					].filter(Boolean).length <= 1,
				"Provide at most one placement selector",
			),
		(a) =>
			service.moveDocument(
				actor,
				a.projectSlug,
				a.documentId,
				a.targetSection,
				a,
			),
	);
	tool(
		"docs_reorder",
		"Reorder documents",
		"Set the complete sibling document order for a section.",
		project.extend({
			section: z.string().min(1),
			documentIds: z.array(z.uuid()).min(1),
		}),
		(a) =>
			service.reorderDocuments(
				actor,
				a.projectSlug,
				a.section,
				a.documentIds,
			),
	);
	tool(
		"docs_trash",
		"Trash document",
		"Soft-delete a document while retaining it for restoration.",
		docRef,
		(a) => service.trashDocument(actor, a.projectSlug, a.documentId),
		{ destructiveHint: true },
	);
	tool(
		"docs_restore",
		"Restore document",
		"Restore a trashed document, optionally repositioning its retained navigation entry.",
		docRef
			.extend(placement)
			.refine(
				(a) =>
					[
						a.position !== undefined,
						!!a.beforeDocumentId,
						!!a.afterDocumentId,
					].filter(Boolean).length <= 1,
				"Provide at most one placement selector",
			),
		(a) => service.restoreDocument(actor, a.projectSlug, a.documentId, a),
	);
	tool(
		"docs_purge_preview",
		"Preview document purge",
		"Inspect a trashed document and issue a five-minute confirmation token.",
		docRef,
		(a) => service.purgePreview(actor, a.projectSlug, a.documentId),
		{ readOnlyHint: true },
	);
	tool(
		"docs_purge",
		"Permanently delete document",
		"Permanently delete a trashed document using a fresh preview token.",
		docRef.extend({ confirmationToken: z.string().min(1) }),
		(a) =>
			service.purgeDocument(
				actor,
				a.projectSlug,
				a.documentId,
				a.confirmationToken,
			),
		{ destructiveHint: true },
	);
	tool(
		"sections_list",
		"List sections",
		"List navigation sections and document counts.",
		project,
		(a) => service.listSections(actor, a.projectSlug),
		{ readOnlyHint: true },
	);
	tool(
		"sections_create",
		"Create section",
		"Create an empty navigation section.",
		project.extend({
			title: z.string().min(1).max(500),
			slug: slugSegment,
			position: z.int().nonnegative().optional(),
		}),
		(a) => service.createSection(actor, a.projectSlug, a),
	);
	tool(
		"sections_update",
		"Update section",
		"Update a section title.",
		project.extend({
			section: z.string().min(1),
			title: z.string().min(1),
		}),
		(a) => service.updateSection(actor, a.projectSlug, a.section, a.title),
	);
	tool(
		"sections_reorder",
		"Reorder sections",
		"Set the complete navigation section order.",
		project.extend({ sectionIds: z.array(z.string().min(1)).min(1) }),
		(a) => service.reorderSections(actor, a.projectSlug, a.sectionIds),
	);
	tool(
		"sections_delete_preview",
		"Preview section deletion",
		"List affected documents and issue a five-minute cascade confirmation token.",
		project.extend({ section: z.string().min(1) }),
		(a) => service.deleteSectionPreview(actor, a.projectSlug, a.section),
		{ readOnlyHint: true },
	);
	tool(
		"sections_delete",
		"Delete section",
		"Delete an empty section, or permanently cascade after a preview confirmation.",
		project.extend({
			section: z.string().min(1),
			childHandling: z.enum(["reject_if_nonempty", "confirmed_cascade"]),
			confirmationToken: z.string().optional(),
		}),
		(a) =>
			service.deleteSection(
				actor,
				a.projectSlug,
				a.section,
				a.childHandling,
				a.confirmationToken,
			),
		{ destructiveHint: true },
	);
	tool(
		"navigation_get",
		"Get navigation",
		"Get the complete ordered navigation structure.",
		project,
		(a) => service.getNavigation(actor, a.projectSlug),
		{ readOnlyHint: true },
	);
	tool(
		"seo_get",
		"Get document SEO",
		"Get typed SEO settings for a document.",
		docRef,
		(a) => service.getSeo(actor, a.projectSlug, a.documentId),
		{ readOnlyHint: true },
	);
	tool(
		"seo_update",
		"Update document SEO",
		"Patch typed SEO settings; omitted nested fields are preserved.",
		docRef.extend({ seo, expectedUpdatedAt: z.iso.datetime().optional() }),
		(a) =>
			service.updateSeo(
				actor,
				a.projectSlug,
				a.documentId,
				a.seo as SeoData,
				a.expectedUpdatedAt,
			),
	);
	tool(
		"seo_validate",
		"Validate SEO",
		"Validate proposed SEO settings without saving.",
		z.object({ seo }),
		(a) => service.validateSeo(a.seo),
		{ readOnlyHint: true },
	);
	tool(
		"seo_preview",
		"Preview metadata",
		"Preview resolved title, description, robots, Open Graph, and Twitter metadata.",
		docRef,
		(a) => service.seoPreview(actor, a.projectSlug, a.documentId),
		{ readOnlyHint: true },
	);
	tool(
		"sitemap_preview",
		"Preview sitemap",
		"List published documents eligible for the project sitemap.",
		project,
		(a) => service.sitemapPreview(actor, a.projectSlug),
		{ readOnlyHint: true },
	);
	return server;
}
