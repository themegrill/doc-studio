const assert = require("node:assert/strict");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const fixturePath =
	process.env.REVISION_FIXTURE_PATH || "/tmp/docstudio-api-fixture.json";
const f = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const base = process.env.REVISION_TEST_ORIGIN || "http://localhost:3107";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
	throw Error("API smoke tests require a local isolated server");
let checks = 0;
function client() {
	const jar = new Map();
	return async (path, options = {}) => {
		const headers = { ...options.headers };
		if (jar.size)
			headers.cookie = [...jar].map(([k, v]) => k + "=" + v).join("; ");
		const res = await fetch(base + path, {
			...options,
			headers,
			redirect: "manual",
		});
		for (const c of res.headers.getSetCookie()) {
			const first = c.split(";")[0],
				i = first.indexOf("=");
			jar.set(first.slice(0, i), first.slice(i + 1));
		}
		return res;
	};
}
async function login(role) {
	const req = client();
	const csrf = await (await req("/api/auth/csrf")).json();
	const res = await req("/api/auth/callback/credentials", {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
			"X-Auth-Return-Redirect": "1",
		},
		body: new URLSearchParams({
			csrfToken: csrf.csrfToken,
			email: f.users[role].email,
			password: f.password,
			callbackUrl: base + "/projects",
		}),
	});
	assert.ok([200, 302].includes(res.status));
	const session = await (await req("/api/auth/session")).json();
	assert.equal(session.user.id, f.users[role].id);
	return req;
}
const root = `/api/projects/${f.projectSlug}/documents/${f.documentId}/revisions`;
const stagedTitle = `Staged API title ${randomUUID()}`;
async function check(req, path, status, method = "GET", body, raw = false) {
	const res = await req(path, {
		method,
		...(body === undefined
			? {}
			: {
					headers: { "content-type": "application/json" },
					body: raw ? body : JSON.stringify(body),
				}),
	});
	const text = await res.text();
	assert.equal(
		res.status,
		status,
		`${method} ${path}: ${text.slice(0, 500)}`,
	);
	assert.match(res.headers.get("cache-control"), /private.*no-store/);
	assert.match(res.headers.get("x-robots-tag"), /noindex/);
	checks++;
	return text ? JSON.parse(text) : null;
}
(async () => {
	const anon = client(),
		editor = await login("editor"),
		viewer = await login("viewer"),
		outsider = await login("outsider");
	await check(anon, root, 401);
	await check(anon, root, 401, "POST", {});
	await check(outsider, root, 403);
	await check(viewer, root, 200);
	await check(viewer, root, 403, "POST", {});
	await check(editor, root.replace(f.documentId, "not-a-uuid"), 400);
	await check(editor, root + "?limit=-1", 400);
	await check(editor, root, 400, "POST", "{", true);
	await check(editor, root, 400, "POST", { slug: "bad" });
	const original = await (
		await anon(`/api/docs/guide/install?projectSlug=${f.projectSlug}`)
	).json();
	let revision = await check(editor, root, 201, "POST", {
		productVersion: "API 3.0",
	});
	f.revisionId = revision.id;
	const detail = root + "/" + revision.id;
	await check(anon, detail, 401);
	await check(outsider, detail, 403);
	await check(viewer, detail, 200);
	await check(
		editor,
		root.replace(f.documentId, f.unpublishedId) + "/" + revision.id,
		404,
	);
	await check(editor, detail, 400, "PATCH", { title: "Missing token" });
	await check(editor, detail, 400, "PATCH", {
		expectedEditVersion: "0",
		title: "Invalid token",
	});
	await check(editor, detail, 400, "PATCH", {
		expectedEditVersion: revision.editVersion,
		seo: { sitemap: { priority: 3 } },
	});
	await check(viewer, detail, 403, "PATCH", {
		expectedEditVersion: revision.editVersion,
		title: "Viewer",
	});
	for (const action of ["ready", "discard", "publish"])
		await check(viewer, detail + "/" + action, 403, "POST", {
			expectedEditVersion: revision.editVersion,
			...(action === "ready"
				? { ready: true }
				: action === "publish"
					? { expectedDocumentVersion: revision.baseDocumentVersion }
					: {}),
		});
	revision = await check(editor, detail, 200, "PATCH", {
		expectedEditVersion: revision.editVersion,
		title: stagedTitle,
		description: "Staged description",
		seo: { metaTitle: "Staged SEO" },
	});
	await check(editor, detail, 409, "PATCH", {
		expectedEditVersion: "1",
		title: "Stale",
	});
	const privateSearch = await anon(
		`/api/search?projectSlug=${f.projectSlug}&q=${encodeURIComponent(stagedTitle)}`,
	);
	assert.equal(privateSearch.status, 200);
	assert.match(privateSearch.headers.get("cache-control"), /no-store/);
	assert.equal((await privateSearch.json()).results.length, 0);
	checks++;
	const categorySearch = await anon(
		`/api/search?projectSlug=${f.projectSlug}&q=guide`,
	);
	assert.equal(categorySearch.status, 200);
	assert.ok(
		(await categorySearch.json()).results.some(
			(x) => x.isSection && x.slug === "guide",
		),
	);
	checks++;
	const staged = await (
		await anon(
			`/api/docs/guide/install?projectSlug=${f.projectSlug}&revisionId=${revision.id}`,
		)
	).json();
	assert.deepEqual(staged, original);
	checks++;
	const unpublished = await anon(
		`/api/docs/guide/unpublished?projectSlug=${f.projectSlug}`,
	);
	assert.equal(unpublished.status, 404);
	checks++;
	revision = await check(editor, detail + "/ready", 200, "POST", {
		expectedEditVersion: revision.editVersion,
		ready: true,
	});
	assert.equal(revision.status, "ready");
	revision = await check(editor, detail, 200, "PATCH", {
		expectedEditVersion: revision.editVersion,
		releaseNote: "API verification",
	});
	assert.equal(revision.status, "draft");
	await check(editor, detail + "/publish", 400, "POST", {
		expectedEditVersion: revision.editVersion,
	});
	const release = await check(editor, detail + "/publish", 200, "POST", {
		expectedEditVersion: revision.editVersion,
		expectedDocumentVersion: revision.baseDocumentVersion,
	});
	assert.equal(release.isCurrent, true);
	const live = await (
		await anon(`/api/docs/guide/install?projectSlug=${f.projectSlug}`)
	).json();
	assert.equal(live.title, stagedTitle);
	assert.equal(live.seo.metaTitle, "Staged SEO");
	checks++;
	const releasedSearch = await anon(
		`/api/search?projectSlug=${f.projectSlug}&q=${encodeURIComponent(stagedTitle)}`,
	);
	assert.equal(releasedSearch.status, 200);
	assert.ok(
		(await releasedSearch.json()).results.some(
			(x) => x.id === f.documentId && x.title === stagedTitle,
		),
	);
	checks++;
	const retry = await check(editor, detail + "/publish", 200, "POST", {
		expectedEditVersion: revision.editVersion,
		expectedDocumentVersion: revision.baseDocumentVersion,
	});
	assert.equal(retry.alreadyReleased, true);
	const next = await check(editor, root, 201, "POST", {});
	f.browserRevisionId = next.id;
	fs.writeFileSync(fixturePath, JSON.stringify(f, null, 2));
	console.log(
		`${checks} API checks passed; editor fixture and fresh draft retained for browser smoke`,
	);
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
