import postgres from "postgres";
import { createHash, timingSafeEqual } from "node:crypto";
import {
	cleanSlug,
	findSection,
	insertDocument,
	normalizeNavigation,
	removeDocument,
	replaceRedirects,
	routeSlug,
	safeSlugSegment,
	sectionDocumentRefs,
	sectionPrefix,
	sectionSlug,
} from "./navigation.js";
import {
	DomainError,
	type ActorContext,
	type Block,
	type Navigation,
	type Placement,
	type ProjectRole,
	type SeoData,
} from "./types.js";

type Db =
	| postgres.Sql<Record<string, unknown>>
	| postgres.TransactionSql<Record<string, unknown>>;
type RootDb = postgres.Sql<Record<string, unknown>>;
const roleRank: ProjectRole[] = ["viewer", "editor", "admin", "owner"];
const initialBlocks = (title: string): Block[] => [
	{
		id: crypto.randomUUID(),
		type: "heading",
		props: { level: 1 },
		content: [{ type: "text", text: title, styles: {} }],
		children: [],
	},
	{
		id: crypto.randomUUID(),
		type: "paragraph",
		props: {},
		content: [
			{
				type: "text",
				text: "Start writing your documentation here...",
				styles: {},
			},
		],
		children: [],
	},
];

export interface DocumentPatch {
	title?: string;
	description?: string | null;
	blocks?: Block[];
	expectedUpdatedAt?: string;
}
export interface DocumentCreate extends Placement {
	title: string;
	slug: string;
	section: string;
	description?: string;
	blocks?: Block[];
	seo?: SeoData;
	published?: boolean;
}
export interface CompoundDocumentPatch extends DocumentPatch {
	seo?: SeoData;
	published?: boolean;
	newSlug?: string;
}

export function assertActorScope(actor: ActorContext, required: string) {
	if (actor.scopes === undefined) {
		if (actor.transport === "web") return;
		throw new DomainError(
			"FORBIDDEN",
			"Explicit scopes are required for non-web actors",
		);
	}
	if (!actor.scopes.includes(required))
		throw new DomainError("FORBIDDEN", `Missing scope: ${required}`);
}

export function validateBlocks(blocks: Block[]) {
	if (blocks.length > 500)
		throw new DomainError(
			"INVALID_INPUT",
			"A document may contain at most 500 top-level blocks",
		);
	if (Buffer.byteLength(JSON.stringify(blocks), "utf8") > 1_000_000)
		throw new DomainError(
			"INVALID_INPUT",
			"Document blocks exceed the 1 MB limit",
		);
	let total = 0;
	const visit = (items: Block[], depth: number) => {
		if (depth > 10)
			throw new DomainError(
				"INVALID_INPUT",
				"Block nesting exceeds 10 levels",
			);
		for (const block of items) {
			total += 1;
			if (total > 2_000)
				throw new DomainError(
					"INVALID_INPUT",
					"Document exceeds 2,000 total blocks",
				);
			if (
				!block.id ||
				block.id.length > 128 ||
				!block.type ||
				block.type.length > 64
			)
				throw new DomainError(
					"INVALID_INPUT",
					"Every block needs a bounded id and type",
				);
			validateJsonDepth(block.props, 1);
			validateJsonDepth(block.content, 1);
			if (block.children) visit(block.children, depth + 1);
		}
	};
	visit(blocks, 1);
}

function validateJsonDepth(value: unknown, depth: number) {
	if (depth > 20)
		throw new DomainError(
			"INVALID_INPUT",
			"Block data nesting exceeds 20 levels",
		);
	if (typeof value === "string" && value.length > 100_000)
		throw new DomainError(
			"INVALID_INPUT",
			"A block string exceeds 100,000 characters",
		);
	if (Array.isArray(value)) {
		if (value.length > 5_000)
			throw new DomainError(
				"INVALID_INPUT",
				"A block array is too large",
			);
		for (const item of value) validateJsonDepth(item, depth + 1);
	} else if (value && typeof value === "object") {
		const entries = Object.entries(value);
		if (entries.length > 200)
			throw new DomainError(
				"INVALID_INPUT",
				"A block object has too many fields",
			);
		for (const [, item] of entries) validateJsonDepth(item, depth + 1);
	}
}

export function sectionStateFingerprint(
	section: unknown,
	documents: Array<{ id?: unknown; slug?: unknown }>,
) {
	const ids = documents.map((doc) => `${doc.id}:${doc.slug}`).sort();
	return createHash("sha256")
		.update(JSON.stringify({ section, ids }))
		.digest("hex");
}

export class DocumentService {
	constructor(
		private sql: RootDb,
		private confirmationSecret = process.env
			.DOC_STUDIO_MCP_CONFIRMATION_SECRET ?? "",
	) {}

	private scope(actor: ActorContext, required: string) {
		assertActorScope(actor, required);
	}

	private async project(
		actor: ActorContext,
		projectSlug: string,
		role: ProjectRole,
		db: Db = this.sql,
	) {
		const [project] =
			await db`SELECT id, name, slug, description, domain, redirects, settings FROM projects WHERE slug = ${cleanSlug(projectSlug)} LIMIT 1`;
		if (!project) throw new DomainError("NOT_FOUND", "Project not found");
		const [user] =
			await db`SELECT role FROM users WHERE id = ${actor.userId} LIMIT 1`;
		const elevated = user?.role === "admin" || user?.role === "super_admin";
		const [member] = elevated
			? [{ role: "owner" }]
			: await db`SELECT role FROM project_members WHERE user_id = ${actor.userId} AND project_id = ${project.id} LIMIT 1`;
		if (
			!member ||
			roleRank.indexOf(member.role as ProjectRole) <
				roleRank.indexOf(role)
		)
			throw new DomainError(
				"FORBIDDEN",
				`Project ${role} access required`,
			);
		return project;
	}

	async listProjects(actor: ActorContext) {
		this.scope(actor, "projects:read");
		const [user] = await this
			.sql`SELECT role FROM users WHERE id = ${actor.userId}`;
		if (user?.role === "admin" || user?.role === "super_admin")
			return this
				.sql`SELECT id, name, slug, description, domain, updated_at FROM projects ORDER BY name`;
		return this
			.sql`SELECT p.id, p.name, p.slug, p.description, p.domain, p.updated_at, pm.role FROM projects p JOIN project_members pm ON pm.project_id=p.id WHERE pm.user_id=${actor.userId} ORDER BY p.name`;
	}

	async getProject(actor: ActorContext, projectSlug: string) {
		this.scope(actor, "projects:read");
		return this.project(actor, projectSlug, "viewer");
	}

	async listDocuments(
		actor: ActorContext,
		projectSlug: string,
		options: {
			published?: boolean;
			includeTrash?: boolean;
			section?: string;
			limit?: number;
			offset?: number;
		} = {},
	) {
		if (options.includeTrash) this.scope(actor, "docs:delete");
		this.scope(actor, "docs:read");
		const p = await this.project(
			actor,
			projectSlug,
			options.includeTrash ? "editor" : "viewer",
		);
		const rows = await this
			.sql`SELECT id, slug, title, description, published, seo, created_at, updated_at, deleted_at FROM documents WHERE project_id=${p.id} AND (${options.includeTrash ?? false} OR deleted_at IS NULL) AND (${options.published ?? null}::boolean IS NULL OR published=${options.published ?? null}) AND (${options.section ?? null}::text IS NULL OR slug=${options.section ?? null} OR slug LIKE ${options.section ? cleanSlug(options.section) + "/%" : null}) ORDER BY slug LIMIT ${Math.min(options.limit ?? 100, 200)} OFFSET ${options.offset ?? 0}`;
		return rows;
	}

	async getDocument(
		actor: ActorContext,
		projectSlug: string,
		ref: { documentId?: string; slug?: string },
		includeBlocks = true,
		includeTrash = false,
	) {
		if (includeTrash) this.scope(actor, "docs:delete");
		this.scope(actor, "docs:read");
		const p = await this.project(
			actor,
			projectSlug,
			includeTrash ? "editor" : "viewer",
		);
		const rows = ref.documentId
			? await this
					.sql`SELECT id, slug, title, description, blocks, published, seo, created_at, updated_at, deleted_at FROM documents WHERE project_id=${p.id} AND id=${ref.documentId} AND (${includeTrash} OR deleted_at IS NULL) LIMIT 1`
			: await this
					.sql`SELECT id, slug, title, description, blocks, published, seo, created_at, updated_at, deleted_at FROM documents WHERE project_id=${p.id} AND slug=${cleanSlug(ref.slug ?? "")} AND (${includeTrash} OR deleted_at IS NULL) LIMIT 1`;
		if (!rows[0]) throw new DomainError("NOT_FOUND", "Document not found");
		const doc = { ...rows[0] };
		if (!includeBlocks) delete doc.blocks;
		return doc;
	}

	private async lockNavigation(db: Db, projectId: unknown) {
		let [row] =
			await db`SELECT id, structure FROM navigation WHERE project_id=${projectId} ORDER BY updated_at DESC LIMIT 1 FOR UPDATE`;
		if (!row)
			[row] =
				await db`INSERT INTO navigation (project_id, structure) VALUES (${projectId}, ${db.json({ title: "Documentation", version: "1.0", routes: [] })}) RETURNING id, structure`;
		return { id: row.id, nav: normalizeNavigation(row.structure) };
	}

	async createDocument(
		actor: ActorContext,
		projectSlug: string,
		input: DocumentCreate,
	) {
		this.scope(actor, "docs:write");
		if (input.published) this.scope(actor, "docs:publish");
		if (input.blocks) validateBlocks(input.blocks);
		return this.sql.begin(async (db) => {
			const p = await this.project(actor, projectSlug, "editor", db);
			const locked = await this.lockNavigation(db, p.id);
			const section = findSection(locked.nav, input.section);
			if (!section)
				throw new DomainError("NOT_FOUND", "Section not found");
			let local: string;
			let prefix: string;
			try {
				local = safeSlugSegment(
					cleanSlug(input.slug).split("/").pop() ?? "",
				);
				prefix = sectionPrefix(section);
			} catch (error) {
				throw new DomainError(
					"INVALID_INPUT",
					(error as Error).message,
				);
			}
			const fullSlug = `${prefix}/${local}`;
			const [conflict] =
				await db`SELECT deleted_at FROM documents WHERE project_id=${p.id} AND slug=${fullSlug}`;
			if (conflict)
				throw new DomainError(
					"CONFLICT",
					conflict.deleted_at
						? "Slug is occupied by a trashed document"
						: "Slug already exists",
				);
			const [doc] =
				await db`INSERT INTO documents (project_id, slug, title, description, blocks, seo, published, created_by, updated_by) VALUES (${p.id}, ${fullSlug}, ${input.title}, ${input.description ?? null}, ${db.json((input.blocks ?? initialBlocks(input.title)) as never)}, ${db.json((input.seo ?? {}) as never)}, ${input.published ?? false}, ${actor.userId}, ${actor.userId}) RETURNING id, slug, title, description, published, seo, created_at, updated_at`;
			const position = insertDocument(
				locked.nav,
				section,
				{
					id: doc.id as string,
					title: input.title,
					path: `/docs/${fullSlug}`,
					slug: fullSlug,
				},
				input,
			);
			await db`UPDATE navigation SET structure=${db.json(locked.nav as never)}, updated_by=${actor.userId} WHERE id=${locked.id}`;
			return { ...doc, position, section: prefix };
		});
	}

	async updateDocument(
		actor: ActorContext,
		projectSlug: string,
		documentId: string,
		patch: DocumentPatch,
	) {
		return this.patchDocument(actor, projectSlug, documentId, patch);
	}

	async patchDocument(
		actor: ActorContext,
		projectSlug: string,
		documentId: string,
		patch: CompoundDocumentPatch,
	) {
		this.scope(actor, "docs:write");
		if (!Object.keys(patch).some((k) => k !== "expectedUpdatedAt"))
			throw new DomainError("INVALID_INPUT", "Patch is empty");
		if (patch.published !== undefined) this.scope(actor, "docs:publish");
		if (patch.blocks) validateBlocks(patch.blocks);
		return this.sql.begin(async (db) => {
			const p = await this.project(actor, projectSlug, "editor", db);
			const [current] =
				await db`SELECT * FROM documents WHERE id=${documentId} AND project_id=${p.id} AND deleted_at IS NULL FOR UPDATE`;
			if (!current)
				throw new DomainError("NOT_FOUND", "Document not found");
			if (
				patch.expectedUpdatedAt &&
				new Date(current.updated_at as string).toISOString() !==
					new Date(patch.expectedUpdatedAt).toISOString()
			)
				throw new DomainError("STALE_VERSION", "Document has changed", {
					updatedAt: current.updated_at,
				});
			const oldSlug = current.slug as string;
			let nextSlug = oldSlug;
			if (patch.newSlug !== undefined) {
				let local: string;
				try {
					local = safeSlugSegment(
						cleanSlug(patch.newSlug).split("/").pop() ?? "",
					);
				} catch (error) {
					throw new DomainError(
						"INVALID_INPUT",
						(error as Error).message,
					);
				}
				nextSlug = `${oldSlug.includes("/") ? oldSlug.slice(0, oldSlug.indexOf("/")) + "/" : ""}${local}`;
				const [taken] =
					await db`SELECT id FROM documents WHERE project_id=${p.id} AND slug=${nextSlug} AND id<>${documentId}`;
				if (taken)
					throw new DomainError("CONFLICT", "Slug already exists");
			}
			const mergedSeo =
				patch.seo === undefined
					? current.seo
					: deepMerge(
							(current.seo ?? {}) as Record<string, unknown>,
							patch.seo as unknown as Record<string, unknown>,
						);
			const [doc] =
				await db`UPDATE documents SET title=${patch.title === undefined ? current.title : patch.title}, description=${patch.description === undefined ? current.description : patch.description}, blocks=${patch.blocks === undefined ? current.blocks : db.json(patch.blocks as never)}, seo=${patch.seo === undefined ? current.seo : db.json(mergedSeo as never)}, published=${patch.published === undefined ? current.published : patch.published}, slug=${nextSlug}, updated_by=${actor.userId}, updated_at=NOW() WHERE id=${documentId} RETURNING id, slug, title, description, published, seo, updated_at`;
			if (patch.title !== undefined || nextSlug !== oldSlug) {
				const locked = await this.lockNavigation(db, p.id);
				for (const r of locked.nav.routes)
					for (const c of [r, ...(r.children ?? [])])
						if (c.id === documentId || routeSlug(c) === oldSlug) {
							if (patch.title !== undefined)
								c.title = patch.title;
							if (nextSlug !== oldSlug) {
								c.slug = nextSlug;
								c.path = `/docs/${nextSlug}`;
								c.id = documentId;
							}
						}
				await db`UPDATE navigation SET structure=${db.json(locked.nav as never)}, updated_by=${actor.userId} WHERE id=${locked.id}`;
			}
			if (nextSlug !== oldSlug) {
				const redirects = replaceRedirects(p.redirects, [
					{ oldSlug, newSlug: nextSlug },
				]);
				await db`UPDATE projects SET redirects=${db.json(redirects as never)}, updated_by=${actor.userId} WHERE id=${p.id}`;
			}
			return {
				id: doc.id,
				slug: doc.slug as string,
				title: doc.title,
				description: doc.description,
				published: doc.published,
				seo: doc.seo,
				updated_at: doc.updated_at,
				...(nextSlug !== oldSlug
					? { redirect: { from: `/${oldSlug}`, to: `/${nextSlug}` } }
					: {}),
			};
		});
	}

	async renameDocument(
		actor: ActorContext,
		projectSlug: string,
		documentId: string,
		localSlug: string,
	) {
		return this.patchDocument(actor, projectSlug, documentId, {
			newSlug: localSlug,
		});
	}

	async setPublished(
		actor: ActorContext,
		projectSlug: string,
		documentId: string,
		published: boolean,
	) {
		return this.patchDocument(actor, projectSlug, documentId, {
			published,
		});
	}

	async getNavigation(actor: ActorContext, projectSlug: string) {
		this.scope(actor, "docs:read");
		const p = await this.project(actor, projectSlug, "viewer");
		const [row] = await this
			.sql`SELECT structure, updated_at FROM navigation WHERE project_id=${p.id} ORDER BY updated_at DESC LIMIT 1`;
		return {
			structure: normalizeNavigation(row?.structure),
			updatedAt: row?.updated_at ?? null,
		};
	}

	async moveDocument(
		actor: ActorContext,
		projectSlug: string,
		documentId: string,
		targetSection: string,
		placement: Placement = {},
	) {
		this.scope(actor, "docs:write");
		return this.sql.begin(async (db) => {
			const p = await this.project(actor, projectSlug, "editor", db);
			const [doc] =
				await db`SELECT id, slug, title FROM documents WHERE id=${documentId} AND project_id=${p.id} AND deleted_at IS NULL FOR UPDATE`;
			if (!doc) throw new DomainError("NOT_FOUND", "Document not found");
			const locked = await this.lockNavigation(db, p.id);
			const target = findSection(locked.nav, targetSection);
			if (!target)
				throw new DomainError("NOT_FOUND", "Target section not found");
			const oldSlug = doc.slug as string;
			let local: string;
			let prefix: string;
			try {
				local = safeSlugSegment(
					oldSlug.includes("/")
						? oldSlug.slice(oldSlug.indexOf("/") + 1)
						: oldSlug,
				);
				prefix = sectionPrefix(target);
			} catch (error) {
				throw new DomainError(
					"INVALID_INPUT",
					(error as Error).message,
				);
			}
			let next = `${prefix}/${local}`;
			let n = 2;
			while (
				(
					await db`SELECT id FROM documents WHERE project_id=${p.id} AND slug=${next} AND id<>${documentId}`
				).length
			)
				next = `${prefix}/${local}-${n++}`;
			removeDocument(locked.nav, documentId, oldSlug);
			const position = insertDocument(
				locked.nav,
				target,
				{
					id: documentId,
					title: doc.title as string,
					slug: next,
					path: `/docs/${next}`,
				},
				placement,
			);
			await db`UPDATE documents SET slug=${next}, updated_by=${actor.userId}, updated_at=NOW() WHERE id=${documentId}`;
			await db`UPDATE navigation SET structure=${db.json(locked.nav as never)}, updated_by=${actor.userId} WHERE id=${locked.id}`;
			const redirects = replaceRedirects(p.redirects, [
				{ oldSlug, newSlug: next },
			]);
			await db`UPDATE projects SET redirects=${db.json(redirects as never)}, updated_by=${actor.userId} WHERE id=${p.id}`;
			return {
				id: documentId,
				slug: next,
				position,
				section: prefix,
				redirect: { from: `/${oldSlug}`, to: `/${next}` },
			};
		});
	}

	async reorderDocuments(
		actor: ActorContext,
		projectSlug: string,
		sectionRef: string,
		documentIds: string[],
	) {
		this.scope(actor, "docs:write");
		return this.sql.begin(async (db) => {
			const p = await this.project(actor, projectSlug, "editor", db);
			const locked = await this.lockNavigation(db, p.id);
			const section = findSection(locked.nav, sectionRef);
			if (!section)
				throw new DomainError("NOT_FOUND", "Section not found");
			const children = section.children ?? [];
			if (
				children.length !== documentIds.length ||
				new Set(documentIds).size !== documentIds.length ||
				documentIds.some((id) => !children.some((c) => c.id === id))
			)
				throw new DomainError(
					"INVALID_INPUT",
					"documentIds must contain every sibling exactly once",
				);
			section.children = documentIds.map((id, i) => ({
				...children.find((c) => c.id === id)!,
				orderIndex: i,
			}));
			await db`UPDATE navigation SET structure=${db.json(locked.nav as never)}, updated_by=${actor.userId} WHERE id=${locked.id}`;
			return { section: sectionSlug(section), documentIds };
		});
	}

	async listSections(actor: ActorContext, projectSlug: string) {
		const result = await this.getNavigation(actor, projectSlug);
		return result.structure.routes.map((r, position) => ({
			id: r.id ?? sectionSlug(r),
			slug: sectionSlug(r),
			title: r.title,
			position,
			documentCount: r.children?.length ?? 0,
		}));
	}
	async createSection(
		actor: ActorContext,
		projectSlug: string,
		input: { title: string; slug: string; position?: number },
	) {
		this.scope(actor, "docs:write");
		return this.sql.begin(async (db) => {
			const p = await this.project(actor, projectSlug, "editor", db);
			const locked = await this.lockNavigation(db, p.id);
			let slug: string;
			try {
				slug = safeSlugSegment(input.slug);
			} catch (error) {
				throw new DomainError(
					"INVALID_INPUT",
					(error as Error).message,
				);
			}
			if (
				findSection(locked.nav, slug) ||
				(
					await db`SELECT id FROM documents WHERE project_id=${p.id} AND slug=${slug}`
				).length
			)
				throw new DomainError(
					"CONFLICT",
					"Section slug already exists",
				);
			const section = {
				id: crypto.randomUUID(),
				title: input.title,
				slug,
				path: `/docs/${slug}`,
				children: [],
			};
			const position = Math.max(
				0,
				Math.min(
					input.position ?? locked.nav.routes.length,
					locked.nav.routes.length,
				),
			);
			locked.nav.routes.splice(position, 0, section);
			await db`UPDATE navigation SET structure=${db.json(locked.nav as never)}, updated_by=${actor.userId} WHERE id=${locked.id}`;
			return { ...section, position };
		});
	}
	async updateSection(
		actor: ActorContext,
		projectSlug: string,
		sectionRef: string,
		title: string,
	) {
		this.scope(actor, "docs:write");
		return this.sql.begin(async (db) => {
			const p = await this.project(actor, projectSlug, "editor", db);
			const locked = await this.lockNavigation(db, p.id);
			const section = findSection(locked.nav, sectionRef);
			if (!section)
				throw new DomainError("NOT_FOUND", "Section not found");
			section.title = title;
			await db`UPDATE navigation SET structure=${db.json(locked.nav as never)}, updated_by=${actor.userId} WHERE id=${locked.id}`;
			await db`UPDATE documents SET title=${title}, updated_by=${actor.userId} WHERE project_id=${p.id} AND slug=${sectionSlug(section)}`;
			return section;
		});
	}
	async reorderSections(
		actor: ActorContext,
		projectSlug: string,
		sectionIds: string[],
	) {
		this.scope(actor, "docs:write");
		return this.sql.begin(async (db) => {
			const p = await this.project(actor, projectSlug, "editor", db);
			const locked = await this.lockNavigation(db, p.id);
			if (
				locked.nav.routes.length !== sectionIds.length ||
				new Set(sectionIds).size !== sectionIds.length
			)
				throw new DomainError(
					"INVALID_INPUT",
					"sectionIds must contain every section exactly once",
				);
			locked.nav.routes = sectionIds.map((id) => {
				const section = findSection(locked.nav, id);
				if (!section)
					throw new DomainError(
						"INVALID_INPUT",
						`Unknown section: ${id}`,
					);
				return section;
			});
			await db`UPDATE navigation SET structure=${db.json(locked.nav as never)}, updated_by=${actor.userId} WHERE id=${locked.id}`;
			return sectionIds;
		});
	}
	private affectedSectionDocuments(
		section: Navigation["routes"][number],
		rows: Record<string, unknown>[],
	) {
		const refs = sectionDocumentRefs(section);
		const ids = new Set(refs.map((ref) => ref.id).filter(Boolean));
		const slugs = new Set(refs.map((ref) => ref.slug).filter(Boolean));
		const direct = routeSlug(section);
		if (direct && !direct.includes("/")) slugs.add(direct);
		return rows.filter(
			(row) => ids.has(row.id as string) || slugs.has(row.slug as string),
		);
	}
	async deleteSectionPreview(
		actor: ActorContext,
		projectSlug: string,
		sectionRef: string,
	) {
		this.scope(actor, "docs:delete");
		const p = await this.project(actor, projectSlug, "admin");
		const navigation = await this.getNavigation(actor, projectSlug);
		const section = findSection(navigation.structure, sectionRef);
		if (!section) throw new DomainError("NOT_FOUND", "Section not found");
		const rows = await this
			.sql`SELECT id, slug, title, deleted_at FROM documents WHERE project_id=${p.id} ORDER BY id`;
		const docs = this.affectedSectionDocuments(section, [...rows]);
		let key: string;
		try {
			key = section.id ?? sectionPrefix(section);
		} catch (error) {
			throw new DomainError("INVALID_INPUT", (error as Error).message);
		}
		const state = sectionStateFingerprint(navigation.structure, docs);
		const expiresAt = Date.now() + 5 * 60_000;
		return {
			section: {
				id: key,
				slug: routeSlug(section) || null,
				title: section.title,
			},
			documents: docs,
			state,
			confirmationToken: this.token(
				p.id,
				"section-delete",
				`${key}:${state}`,
				expiresAt,
			),
			expiresAt: new Date(expiresAt).toISOString(),
		};
	}
	async deleteSection(
		actor: ActorContext,
		projectSlug: string,
		sectionRef: string,
		childHandling: "reject_if_nonempty" | "confirmed_cascade",
		confirmationToken?: string,
	) {
		this.scope(actor, "docs:delete");
		return this.sql.begin(async (db) => {
			const p = await this.project(actor, projectSlug, "admin", db);
			const locked = await this.lockNavigation(db, p.id);
			const section = findSection(locked.nav, sectionRef);
			if (!section)
				throw new DomainError("NOT_FOUND", "Section not found");
			const rows =
				await db`SELECT id, slug, title, deleted_at FROM documents WHERE project_id=${p.id} ORDER BY id FOR UPDATE`;
			const docs = this.affectedSectionDocuments(section, [...rows]);
			let key: string;
			try {
				key = section.id ?? sectionPrefix(section);
			} catch (error) {
				throw new DomainError(
					"INVALID_INPUT",
					(error as Error).message,
				);
			}
			const state = sectionStateFingerprint(locked.nav, docs);
			if (docs.length && childHandling === "reject_if_nonempty")
				throw new DomainError("CONFLICT", "Section is not empty", {
					documentCount: docs.length,
				});
			if (childHandling === "confirmed_cascade") {
				if (!confirmationToken)
					throw new DomainError(
						"CONFIRMATION_REQUIRED",
						"A preview token is required",
					);
				this.verifyToken(
					p.id,
					"section-delete",
					`${key}:${state}`,
					confirmationToken,
				);
				for (const doc of docs)
					await db`DELETE FROM documents WHERE project_id=${p.id} AND id=${doc.id}`;
			}
			locked.nav.routes = locked.nav.routes.filter(
				(route) => route !== section,
			);
			await db`UPDATE navigation SET structure=${db.json(locked.nav as never)}, updated_by=${actor.userId} WHERE id=${locked.id}`;
			return {
				section: key,
				deletedDocuments:
					childHandling === "confirmed_cascade" ? docs.length : 0,
			};
		});
	}

	async getSeo(actor: ActorContext, projectSlug: string, documentId: string) {
		const doc = await this.getDocument(
			actor,
			projectSlug,
			{ documentId },
			false,
		);
		return {
			documentId,
			slug: doc.slug,
			seo: doc.seo ?? {},
			title: doc.title,
			description: doc.description,
		};
	}
	async updateSeo(
		actor: ActorContext,
		projectSlug: string,
		documentId: string,
		patch: SeoData,
		expectedUpdatedAt?: string,
	) {
		return this.patchDocument(actor, projectSlug, documentId, {
			seo: patch,
			expectedUpdatedAt,
		});
	}

	validateSeo(seo: SeoData) {
		const issues: Array<{
			level: "warning" | "error";
			field: string;
			message: string;
		}> = [];
		if ((seo.metaTitle?.length ?? 0) > 60)
			issues.push({
				level: "warning",
				field: "metaTitle",
				message: "Meta title exceeds 60 characters",
			});
		if ((seo.metaDescription?.length ?? 0) > 160)
			issues.push({
				level: "warning",
				field: "metaDescription",
				message: "Meta description exceeds 160 characters",
			});
		if (seo.canonicalUrl) {
			try {
				new URL(seo.canonicalUrl);
			} catch {
				issues.push({
					level: "error",
					field: "canonicalUrl",
					message: "Canonical URL must be absolute",
				});
			}
		}
		if (
			seo.sitemap?.priority !== undefined &&
			(seo.sitemap.priority < 0 || seo.sitemap.priority > 1)
		)
			issues.push({
				level: "error",
				field: "sitemap.priority",
				message: "Priority must be between 0 and 1",
			});
		return { valid: !issues.some((i) => i.level === "error"), issues };
	}
	async seoPreview(
		actor: ActorContext,
		projectSlug: string,
		documentId: string,
	) {
		const data = await this.getSeo(actor, projectSlug, documentId);
		const seo = data.seo as SeoData;
		return {
			title: seo.metaTitle || data.title,
			description: seo.metaDescription || data.description || "",
			canonicalUrl: seo.canonicalUrl || null,
			robots: seo.robots ?? { index: true, follow: true },
			openGraph: {
				title: seo.ogTitle || seo.metaTitle || data.title,
				description:
					seo.ogDescription ||
					seo.metaDescription ||
					data.description ||
					"",
				image: seo.ogImage || null,
			},
			twitterCard: seo.twitterCard || "summary_large_image",
		};
	}
	async sitemapPreview(actor: ActorContext, projectSlug: string) {
		const docs = await this.listDocuments(actor, projectSlug, {
			published: true,
		});
		return docs
			.filter(
				(d) => ((d.seo ?? {}) as SeoData).sitemap?.include !== false,
			)
			.map((d) => ({
				documentId: d.id,
				slug: d.slug,
				priority: ((d.seo ?? {}) as SeoData).sitemap?.priority ?? 0.5,
				changeFrequency:
					((d.seo ?? {}) as SeoData).sitemap?.changeFrequency ??
					"weekly",
				updatedAt: d.updated_at,
			}));
	}

	async trashDocument(
		actor: ActorContext,
		projectSlug: string,
		documentId: string,
	) {
		this.scope(actor, "docs:delete");
		const p = await this.project(actor, projectSlug, "editor");
		const [doc] = await this
			.sql`UPDATE documents SET deleted_at=NOW(), deleted_by=${actor.userId}, updated_by=${actor.userId} WHERE id=${documentId} AND project_id=${p.id} AND deleted_at IS NULL RETURNING id, slug, deleted_at`;
		if (!doc) throw new DomainError("NOT_FOUND", "Document not found");
		return doc;
	}
	async restoreDocument(
		actor: ActorContext,
		projectSlug: string,
		documentId: string,
		placement: Placement = {},
	) {
		this.scope(actor, "docs:delete");
		return this.sql.begin(async (db) => {
			const p = await this.project(actor, projectSlug, "editor", db);
			const [doc] =
				await db`SELECT id, slug, title FROM documents WHERE id=${documentId} AND project_id=${p.id} AND deleted_at IS NOT NULL FOR UPDATE`;
			if (!doc)
				throw new DomainError(
					"NOT_FOUND",
					"Document not found in trash",
				);
			const locked = await this.lockNavigation(db, p.id);
			const section = locked.nav.routes.find((route) =>
				(route.children ?? []).some(
					(child) =>
						child.id === documentId ||
						routeSlug(child) === doc.slug,
				),
			);
			if (!section)
				throw new DomainError(
					"CONFLICT",
					"The retained navigation entry is missing; restore cannot choose a section safely",
				);
			const hasPlacement =
				placement.position !== undefined ||
				placement.beforeDocumentId ||
				placement.afterDocumentId;
			let position = (section.children ?? []).findIndex(
				(child) =>
					child.id === documentId || routeSlug(child) === doc.slug,
			);
			if (hasPlacement) {
				removeDocument(locked.nav, documentId, doc.slug as string);
				position = insertDocument(
					locked.nav,
					section,
					{
						id: documentId,
						slug: doc.slug as string,
						path: `/docs/${doc.slug}`,
						title: doc.title as string,
					},
					placement,
				);
				await db`UPDATE navigation SET structure=${db.json(locked.nav as never)}, updated_by=${actor.userId} WHERE id=${locked.id}`;
			}
			const [updated] =
				await db`UPDATE documents SET deleted_at=NULL, deleted_by=NULL, updated_by=${actor.userId}, updated_at=NOW() WHERE id=${documentId} RETURNING id, slug, updated_at`;
			return { ...updated, position };
		});
	}
	private token(
		projectId: unknown,
		kind: string,
		target: string,
		expires: number,
	) {
		if (!this.confirmationSecret)
			throw new DomainError(
				"CONFIRMATION_REQUIRED",
				"DOC_STUDIO_MCP_CONFIRMATION_SECRET is required for destructive operations",
			);
		return `${expires}.${createHash("sha256").update(`${this.confirmationSecret}:${projectId}:${kind}:${target}:${expires}`).digest("hex")}`;
	}
	async purgePreview(
		actor: ActorContext,
		projectSlug: string,
		documentId: string,
	) {
		this.scope(actor, "docs:delete");
		const p = await this.project(actor, projectSlug, "admin");
		const [doc] = await this
			.sql`SELECT id, slug, title FROM documents WHERE id=${documentId} AND project_id=${p.id} AND deleted_at IS NOT NULL`;
		if (!doc)
			throw new DomainError("NOT_FOUND", "Document not found in trash");
		const expiresAt = Date.now() + 5 * 60_000;
		return {
			document: doc,
			confirmationToken: this.token(p.id, "purge", documentId, expiresAt),
			expiresAt: new Date(expiresAt).toISOString(),
		};
	}
	async purgeDocument(
		actor: ActorContext,
		projectSlug: string,
		documentId: string,
		confirmationToken: string,
	) {
		this.scope(actor, "docs:delete");
		return this.sql.begin(async (db) => {
			const p = await this.project(actor, projectSlug, "admin", db);
			this.verifyToken(p.id, "purge", documentId, confirmationToken);
			const locked = await this.lockNavigation(db, p.id);
			const [doc] =
				await db`DELETE FROM documents WHERE id=${documentId} AND project_id=${p.id} AND deleted_at IS NOT NULL RETURNING id, slug`;
			if (!doc)
				throw new DomainError(
					"NOT_FOUND",
					"Document not found in trash",
				);
			removeDocument(locked.nav, documentId, doc.slug as string);
			await db`UPDATE navigation SET structure=${db.json(locked.nav as never)}, updated_by=${actor.userId} WHERE id=${locked.id}`;
			return doc;
		});
	}
	private verifyToken(
		projectId: unknown,
		kind: string,
		target: string,
		value: string,
	) {
		const [raw] = value.split(".");
		const expires = Number(raw);
		if (!Number.isFinite(expires) || expires < Date.now())
			throw new DomainError(
				"CONFIRMATION_REQUIRED",
				"Confirmation token expired or invalid",
			);
		const expected = this.token(projectId, kind, target, expires);
		const a = Buffer.from(expected);
		const b = Buffer.from(value);
		if (a.length !== b.length || !timingSafeEqual(a, b))
			throw new DomainError(
				"CONFIRMATION_REQUIRED",
				"Confirmation token expired or invalid",
			);
	}
}

function deepMerge<T extends Record<string, unknown>>(base: T, patch: T): T {
	const out = { ...base };
	for (const [key, value] of Object.entries(patch))
		out[key as keyof T] = (
			value && typeof value === "object" && !Array.isArray(value)
				? deepMerge(
						(base[key] as Record<string, unknown>) ?? {},
						value as Record<string, unknown>,
					)
				: value
		) as T[keyof T];
	return out;
}
export function createDatabase(
	url = process.env.DATABASE_URL ??
		"postgres://tg_docs_user:tg_docs_password@localhost:5432/tg_docs_db",
) {
	return postgres(url, { max: 10, idle_timeout: 20, connect_timeout: 10 });
}
