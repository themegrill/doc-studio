import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test, { before, after } from "node:test";
import postgres from "postgres";
import {
	DocumentService,
	DomainError,
	type ActorContext,
	type RevisionDetail,
} from "../src/index.js";

// Deliberately opt-in. Never migrate, truncate, or reset a development database.
const databaseUrl = process.env.DOC_STUDIO_TEST_DATABASE_URL;
if (!databaseUrl)
	throw new Error(
		"DOC_STUDIO_TEST_DATABASE_URL is required for integration tests",
	);
const target = new URL(databaseUrl);
if (!/(?:^|_)test(?:_|$)/.test(target.pathname.slice(1))) {
	throw new Error(
		"Integration database name must contain a separate 'test' component",
	);
}
const sql = postgres(databaseUrl, { max: 8, onnotice: () => {} });
const service = new DocumentService(sql, "integration-fixture-secret");
const ownedProjects: string[] = [];
const ownedUsers: string[] = [];
before(async () => {
	for (const name of [
		"01-init.sql",
		"10-seo-fields.sql",
		"11-project-redirects.sql",
		"12-soft-delete.sql",
		"14-document-revisions.sql",
	]) {
		await sql.unsafe(
			await readFile(
				new URL(`../../web/db/${name}`, import.meta.url),
				"utf8",
			),
		);
	}
});
after(async () => {
	try {
		for (const id of ownedProjects)
			await sql`DELETE FROM projects WHERE id=${id}`;
		for (const id of ownedUsers)
			await sql`DELETE FROM users WHERE id=${id}`;
	} finally {
		await sql.end();
	}
});
async function user(role = "user"): Promise<ActorContext> {
	const id = randomUUID();
	ownedUsers.push(id);
	await sql`INSERT INTO users(id,email,role) VALUES(${id},${id + "@revisions.test"},${role})`;
	return { userId: id, transport: "web" };
}
async function fixture(published = true, version = "1") {
	const actor = await user();
	const viewer = await user();
	const outsider = await user();
	const projectId = randomUUID(),
		documentId = randomUUID(),
		projectSlug = `revisions-${randomUUID()}`;
	ownedProjects.push(projectId);
	await sql`INSERT INTO projects(id,name,slug) VALUES(${projectId},'Revision fixture',${projectSlug})`;
	await sql`INSERT INTO project_members(project_id,user_id,role) VALUES(${projectId},${actor.userId},'editor'),(${projectId},${viewer.userId},'viewer')`;
	const blocks = [
		{
			id: "original",
			type: "paragraph",
			content: [{ type: "text", text: "Original", styles: {} }],
		},
	];
	const seo = {
		metaTitle: "Original SEO",
		robots: { index: true, follow: true },
	};
	await sql`INSERT INTO documents(id,project_id,slug,title,description,blocks,seo,published,content_version) VALUES(${documentId},${projectId},'guide/page','Original','Original description',${sql.json(blocks)},${sql.json(seo)},${published},${version})`;
	await sql`INSERT INTO navigation(project_id,structure) VALUES(${projectId},${sql.json({ title: "Docs", version: "1", routes: [{ title: "Guide", slug: "guide", children: [{ id: documentId, title: "Original", slug: "guide/page", path: "/docs/guide/page" }] }] })})`;
	return {
		actor,
		viewer,
		outsider,
		projectId,
		projectSlug,
		documentId,
		blocks,
		seo,
	};
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const draft = (f: Fixture) =>
	service.createRevision(f.actor, f.projectSlug, f.documentId, {});
const publish = (f: Fixture, r: RevisionDetail) =>
	service.publishRevision(f.actor, f.projectSlug, f.documentId, r.id, {
		expectedEditVersion: r.editVersion,
		expectedDocumentVersion: r.baseDocumentVersion,
	});
async function current(f: Fixture) {
	return (await sql`SELECT * FROM documents WHERE id=${f.documentId}`)[0];
}
async function rejectsCode(run: Promise<unknown>, code: string) {
	await assert.rejects(
		run,
		(error: unknown) => error instanceof DomainError && error.code === code,
	);
}

test("staged content stays isolated; readiness resets and stale saves preserve latest revision", async () => {
	const f = await fixture();
	const original = await current(f);
	const r = await draft(f);
	assert.equal(r.baseDocumentVersion, "1");
	const ready = await service.setRevisionReady(
		f.actor,
		f.projectSlug,
		f.documentId,
		r.id,
		{ expectedEditVersion: r.editVersion, ready: true },
	);
	assert.equal(ready.status, "ready");
	const saved = await service.patchRevision(
		f.actor,
		f.projectSlug,
		f.documentId,
		r.id,
		{
			expectedEditVersion: ready.editVersion,
			title: "Staged",
			description: null,
			blocks: [],
			seo: { robots: { index: false } },
			productVersion: "3.0",
		},
	);
	assert.equal(saved.status, "draft");
	assert.equal(saved.seo.robots?.follow, true);
	assert.equal(saved.seo.robots?.index, false);
	await rejectsCode(
		service.patchRevision(f.actor, f.projectSlug, f.documentId, r.id, {
			expectedEditVersion: ready.editVersion,
			title: "Lost update",
		}),
		"STALE_VERSION",
	);
	assert.equal(
		(await service.getRevision(f.actor, f.projectSlug, f.documentId, r.id))
			.title,
		"Staged",
	);
	assert.deepEqual(await current(f), original);
	const list = await service.listRevisions(
		f.actor,
		f.projectSlug,
		f.documentId,
		{ limit: 1, offset: 0 },
	);
	assert.equal(list.current.title, "Original");
	assert.equal(list.revisions.length, 1);
	assert.ok(list.total >= 2);
	assert.equal("blocks" in list.revisions[0], false);
	assert.equal("seo" in list.revisions[0], false);
});

test("promotion preserves baseline, metadata and URL; history forks use current base", async () => {
	const f = await fixture();
	let r = await draft(f);
	r = await service.patchRevision(
		f.actor,
		f.projectSlug,
		f.documentId,
		r.id,
		{
			expectedEditVersion: r.editVersion,
			title: "Released",
			productVersion: "3.0",
			seo: { metaTitle: "Released SEO" },
		},
	);
	const release = await publish(f, r);
	assert.equal(release.isCurrent, true);
	assert.equal(release.alreadyReleased, false);
	const doc = await current(f);
	assert.equal(doc.title, "Released");
	assert.equal(doc.slug, "guide/page");
	assert.equal(doc.seo.metaTitle, "Released SEO");
	const [nav] =
		await sql`SELECT structure FROM navigation WHERE project_id=${f.projectId}`;
	assert.equal(nav.structure.routes[0].children[0].title, "Released");
	const history = await service.listRevisions(
		f.actor,
		f.projectSlug,
		f.documentId,
		{},
	);
	const baseline = history.revisions.find((x) => x.title === "Original")!;
	assert.equal(baseline.status, "historical");
	assert.equal(baseline.releasedAt, null);
	assert.equal(baseline.wasPublished, true);
	assert.ok(baseline.capturedAt);
	assert.ok(baseline.supersededAt);
	await rejectsCode(
		service.patchRevision(f.actor, f.projectSlug, f.documentId, r.id, {
			expectedEditVersion: release.revision.editVersion,
			title: "Mutate history",
		}),
		"CONFLICT",
	);
	const restored = await service.createRevision(
		f.actor,
		f.projectSlug,
		f.documentId,
		{ sourceRevisionId: baseline.id },
	);
	assert.equal(restored.title, "Original");
	assert.equal(restored.baseDocumentVersion, String(doc.content_version));
	await publish(f, restored);
	const retry = await publish(f, r);
	assert.equal(retry.alreadyReleased, true);
	assert.equal(retry.isCurrent, false);
	assert.equal((await current(f)).title, "Original");
	assert.equal(
		(await service.getRevision(f.actor, f.projectSlug, f.documentId, r.id))
			.productVersion,
		"3.0",
	);
});

test("unpublished source has truthful history and becomes public only on release", async () => {
	const f = await fixture(false);
	const r = await draft(f);
	assert.equal((await current(f)).published, false);
	await publish(f, r);
	const history = await service.listRevisions(
		f.actor,
		f.projectSlug,
		f.documentId,
		{},
	);
	const baseline = history.revisions.find((x) => x.status === "historical")!;
	assert.equal(baseline.wasPublished, false);
	assert.equal(baseline.releasedAt, null);
	assert.equal(baseline.supersededAt, null);
	assert.equal((await current(f)).published, true);
});

test("concurrent creates allocate unique numbers; identical-content release has one winner", async () => {
	const f = await fixture();
	const drafts = await Promise.all(Array.from({ length: 6 }, () => draft(f)));
	assert.equal(new Set(drafts.map((x) => x.revisionNumber)).size, 6);
	const outcomes = await Promise.allSettled([
		publish(f, drafts[0]),
		publish(f, drafts[1]),
	]);
	assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
	const rejected = outcomes.find(
		(x) => x.status === "rejected",
	) as PromiseRejectedResult;
	assert.ok(rejected.reason instanceof DomainError);
	assert.equal(rejected.reason.code, "STALE_VERSION");
	assert.equal(String((await current(f)).content_version), "2");
	const [count] =
		await sql`SELECT count(*)::int AS n FROM document_revisions WHERE document_id=${f.documentId} AND status='released'`;
	assert.equal(count.n, 1);
});

test("simultaneous editor saves have exactly one winner", async () => {
	const f = await fixture();
	const r = await draft(f);
	const outcomes = await Promise.allSettled(
		["Tab one", "Tab two"].map((title) =>
			service.patchRevision(f.actor, f.projectSlug, f.documentId, r.id, {
				expectedEditVersion: r.editVersion,
				title,
			}),
		),
	);
	assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
	const rejected = outcomes.find(
		(x) => x.status === "rejected",
	) as PromiseRejectedResult;
	assert.ok(rejected.reason instanceof DomainError);
	assert.equal(rejected.reason.code, "STALE_VERSION");
	const winner = outcomes.find(
		(x) => x.status === "fulfilled",
	) as PromiseFulfilledResult<RevisionDetail>;
	const stored = await service.getRevision(
		f.actor,
		f.projectSlug,
		f.documentId,
		r.id,
	);
	assert.equal(stored.title, winner.value.title);
	assert.equal(stored.editVersion, "2");
	assert.equal((await current(f)).title, "Original");
});

test("direct edits, unpublish and republish retain history and invalidate old bases", async () => {
	const f = await fixture();
	const r = await draft(f);
	await service.patchDocument(f.actor, f.projectSlug, f.documentId, {
		title: "Direct edit",
	});
	await rejectsCode(publish(f, r), "STALE_VERSION");
	await service.setPublished(f.actor, f.projectSlug, f.documentId, false);
	await service.setPublished(f.actor, f.projectSlug, f.documentId, true);
	const history = await service.listRevisions(
		f.actor,
		f.projectSlug,
		f.documentId,
		{},
	);
	assert.ok(
		history.revisions.some(
			(x) => x.title === "Original" && x.status === "historical",
		),
	);
	assert.equal(
		history.revisions.filter((x) => x.status === "released").length,
		2,
	);
	assert.ok(
		history.revisions.some(
			(x) =>
				x.wasPublished === false && x.appliedDocumentVersion !== null,
		),
	);
	assert.equal(
		history.revisions.filter(
			(x) => x.wasPublished && x.supersededAt === null,
		).length,
		1,
	);
});

test("project, role and scope authorization protects every revision operation", async () => {
	const f = await fixture();
	const other = await fixture();
	const r = await draft(f);
	assert.equal(
		(await service.getRevision(f.viewer, f.projectSlug, f.documentId, r.id))
			.canEdit,
		false,
	);
	await rejectsCode(
		service.createRevision(f.viewer, f.projectSlug, f.documentId, {}),
		"FORBIDDEN",
	);
	await rejectsCode(
		service.patchRevision(f.viewer, f.projectSlug, f.documentId, r.id, {
			expectedEditVersion: r.editVersion,
			title: "Viewer write",
		}),
		"FORBIDDEN",
	);
	await rejectsCode(
		service.setRevisionReady(f.viewer, f.projectSlug, f.documentId, r.id, {
			expectedEditVersion: r.editVersion,
			ready: true,
		}),
		"FORBIDDEN",
	);
	await rejectsCode(
		service.discardRevision(f.viewer, f.projectSlug, f.documentId, r.id, {
			expectedEditVersion: r.editVersion,
		}),
		"FORBIDDEN",
	);
	await rejectsCode(
		service.publishRevision(f.viewer, f.projectSlug, f.documentId, r.id, {
			expectedEditVersion: r.editVersion,
			expectedDocumentVersion: r.baseDocumentVersion,
		}),
		"FORBIDDEN",
	);
	await rejectsCode(
		service.getRevision(f.outsider, f.projectSlug, f.documentId, r.id),
		"FORBIDDEN",
	);
	await rejectsCode(
		service.getRevision(
			other.actor,
			other.projectSlug,
			other.documentId,
			r.id,
		),
		"NOT_FOUND",
	);
	await rejectsCode(
		service.createRevision(
			other.actor,
			other.projectSlug,
			other.documentId,
			{ sourceRevisionId: r.id },
		),
		"NOT_FOUND",
	);
	const scoped: ActorContext = {
		...f.actor,
		transport: "http",
		scopes: ["docs:read", "docs:write"],
	};
	await rejectsCode(
		service.publishRevision(scoped, f.projectSlug, f.documentId, r.id, {
			expectedEditVersion: r.editVersion,
			expectedDocumentVersion: r.baseDocumentVersion,
		}),
		"FORBIDDEN",
	);
	await rejectsCode(
		service.getRevision(
			{ ...scoped, scopes: [] },
			f.projectSlug,
			f.documentId,
			r.id,
		),
		"FORBIDDEN",
	);
	await service.trashDocument(f.actor, f.projectSlug, f.documentId);
	await rejectsCode(
		service.getRevision(f.actor, f.projectSlug, f.documentId, r.id),
		"NOT_FOUND",
	);
});

test("discard and input validation keep immutable states safe", async () => {
	const f = await fixture();
	const r = await draft(f);
	await rejectsCode(
		service.patchRevision(f.actor, f.projectSlug, f.documentId, r.id, {
			expectedEditVersion: r.editVersion,
			title: " ",
		}),
		"INVALID_INPUT",
	);
	await rejectsCode(
		service.patchRevision(f.actor, f.projectSlug, f.documentId, r.id, {
			expectedEditVersion: "0",
			title: "Bad token",
		}),
		"INVALID_INPUT",
	);
	await rejectsCode(
		service.patchRevision(f.actor, f.projectSlug, f.documentId, r.id, {
			expectedEditVersion: r.editVersion,
			seo: { sitemap: { priority: 2 } },
		}),
		"INVALID_INPUT",
	);
	const discarded = await service.discardRevision(
		f.actor,
		f.projectSlug,
		f.documentId,
		r.id,
		{ expectedEditVersion: r.editVersion },
	);
	assert.equal(discarded.status, "discarded");
	await rejectsCode(
		service.publishRevision(f.actor, f.projectSlug, f.documentId, r.id, {
			expectedEditVersion: discarded.editVersion,
			expectedDocumentVersion: r.baseDocumentVersion,
		}),
		"CONFLICT",
	);
	assert.equal(String((await current(f)).content_version), "1");
});

test("BIGINT tokens survive values above JavaScript safe integer range", async () => {
	const f = await fixture(true, "9007199254740993");
	const r = await draft(f);
	assert.equal(r.baseDocumentVersion, "9007199254740993");
	const released = await publish(f, r);
	assert.equal(released.currentDocument.contentVersion, "9007199254740994");
});

test("section overview staging preserves category title until release; direct section edits retain history", async () => {
	const f = await fixture();
	await sql`UPDATE documents SET slug='guide' WHERE id=${f.documentId}`;
	const structure = {
		title: "Docs",
		version: "1",
		routes: [
			{
				title: "Guide",
				children: [
					{
						id: f.documentId,
						title: "Original",
						slug: "guide",
						path: "/docs/guide",
					},
					{
						id: randomUUID(),
						title: "Child",
						slug: "guide/child",
						path: "/docs/guide/child",
					},
				],
			},
		],
	};
	await sql`UPDATE navigation SET structure=${sql.json(structure)} WHERE project_id=${f.projectId}`;
	let r = await draft(f);
	r = await service.patchRevision(
		f.actor,
		f.projectSlug,
		f.documentId,
		r.id,
		{ expectedEditVersion: r.editVersion, title: "New guide" },
	);
	const [before] =
		await sql`SELECT structure FROM navigation WHERE project_id=${f.projectId}`;
	assert.deepEqual(before.structure, structure);
	await publish(f, r);
	const [after] =
		await sql`SELECT structure FROM navigation WHERE project_id=${f.projectId}`;
	assert.equal(after.structure.routes[0].title, "New guide");
	assert.equal(after.structure.routes[0].children[0].title, "New guide");
	assert.deepEqual(
		after.structure.routes[0].children.map((x: { id: string }) => x.id),
		structure.routes[0].children.map((x) => x.id),
	);
	const stale = await draft(f);
	await service.updateSection(
		f.actor,
		f.projectSlug,
		"guide",
		"Direct section change",
	);
	const [renamed] =
		await sql`SELECT structure FROM navigation WHERE project_id=${f.projectId}`;
	assert.equal(
		renamed.structure.routes[0].children[0].title,
		"Direct section change",
	);
	await rejectsCode(publish(f, stale), "STALE_VERSION");
	const history = await service.listRevisions(
		f.actor,
		f.projectSlug,
		f.documentId,
		{},
	);
	assert.ok(
		history.revisions.some(
			(x) => x.title === "New guide" && x.status === "released",
		),
	);
	assert.ok(
		history.revisions.some(
			(x) =>
				x.title === "Direct section change" && x.status === "released",
		),
	);
});

test("structural SQL updates invalidate revision bases without altering draft content", async () => {
	const f = await fixture();
	const r = await draft(f);
	await sql`UPDATE documents SET slug='guide/moved' WHERE id=${f.documentId}`;
	await rejectsCode(publish(f, r), "STALE_VERSION");
	const preserved = await service.getRevision(
		f.actor,
		f.projectSlug,
		f.documentId,
		r.id,
	);
	assert.equal(preserved.title, r.title);
	assert.deepEqual(preserved.blocks, r.blocks);
	assert.equal(preserved.status, "draft");
});

test("navigation failure rolls back document promotion and history together", async () => {
	const f = await fixture();
	const r = await draft(f);
	const saved = await service.patchRevision(
		f.actor,
		f.projectSlug,
		f.documentId,
		r.id,
		{ expectedEditVersion: r.editVersion, title: "Must roll back" },
	);
	const before = await current(f);
	const [historyBefore] =
		await sql`SELECT count(*)::int AS n FROM document_revisions WHERE document_id=${f.documentId}`;
	// Only this fixture's navigation can fail; independent tests/data remain usable.
	const fn = `revision_test_failure_${randomUUID().replaceAll("-", "")}`;
	await sql.unsafe(
		`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.project_id = '${f.projectId}'::uuid THEN RAISE EXCEPTION 'injected navigation failure'; END IF; RETURN NEW; END $$`,
	);
	await sql.unsafe(
		`CREATE TRIGGER ${fn} BEFORE UPDATE ON navigation FOR EACH ROW EXECUTE FUNCTION ${fn}()`,
	);
	try {
		await assert.rejects(publish(f, saved), /injected navigation failure/);
	} finally {
		await sql.unsafe(`DROP TRIGGER ${fn} ON navigation`);
		await sql.unsafe(`DROP FUNCTION ${fn}()`);
	}
	assert.deepEqual(await current(f), before);
	const after = await service.getRevision(
		f.actor,
		f.projectSlug,
		f.documentId,
		r.id,
	);
	assert.equal(after.status, "draft");
	assert.equal(after.editVersion, saved.editVersion);
	const [historyAfter] =
		await sql`SELECT count(*)::int AS n FROM document_revisions WHERE document_id=${f.documentId}`;
	assert.equal(historyAfter.n, historyBefore.n);
});

test("restoring a published trashed document records a new live interval", async () => {
	const f = await fixture();
	const revision = await draft(f);
	const release = await publish(f, revision);
	await service.trashDocument(f.actor, f.projectSlug, f.documentId);
	const [closed] =
		await sql`SELECT * FROM document_revisions WHERE id=${revision.id}`;
	assert.ok(closed.superseded_at);
	await service.restoreDocument(f.actor, f.projectSlug, f.documentId);
	const doc = await current(f);
	const history = await service.listRevisions(
		f.actor,
		f.projectSlug,
		f.documentId,
		{},
	);
	const restored = history.revisions.find(
		(row) => row.appliedDocumentVersion === String(doc.content_version),
	)!;
	assert.equal(restored.status, "released");
	assert.equal(restored.wasPublished, true);
	assert.ok(restored.releasedAt);
	assert.equal(restored.supersededAt, null);
	assert.notEqual(restored.id, release.revision.id);
	const original = await service.getRevision(
		f.actor,
		f.projectSlug,
		f.documentId,
		revision.id,
	);
	assert.equal(
		original.appliedDocumentVersion,
		release.revision.appliedDocumentVersion,
	);
	assert.equal(original.title, release.revision.title);
	assert.ok(original.supersededAt);
	assert.equal(
		history.revisions.filter((row) => row.wasPublished && !row.supersededAt)
			.length,
		1,
	);
});
