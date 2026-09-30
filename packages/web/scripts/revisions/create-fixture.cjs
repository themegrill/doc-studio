const { createRequire } = require("node:module");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const requireWeb = createRequire(
	require("node:path").resolve(__dirname, "../../package.json"),
);
const databaseUrl = process.env.DOC_STUDIO_TEST_DATABASE_URL;
if (
	!databaseUrl ||
	!/(?:^|_)test(?:_|$)/.test(new URL(databaseUrl).pathname.slice(1))
)
	throw Error(
		"DOC_STUDIO_TEST_DATABASE_URL must name an isolated test database",
	);
const sql = requireWeb("postgres")(databaseUrl);
const fixturePath =
	process.env.REVISION_FIXTURE_PATH || "/tmp/docstudio-api-fixture.json";
const bcrypt = requireWeb("bcryptjs");
(async () => {
	const password = "Revision-local-test-2026";
	const hash = await bcrypt.hash(password, 10);
	const fixture = {
		password,
		projectSlug: "revision-browser-test",
		projectId: randomUUID(),
		documentId: randomUUID(),
		unpublishedId: randomUUID(),
		users: {},
	};
	const [existing] =
		await sql`SELECT id FROM projects WHERE slug=${fixture.projectSlug}`;
	if (existing) throw Error("Fixture exists; refusing overwrite");
	for (const role of ["editor", "viewer", "outsider"]) {
		const id = randomUUID(),
			email = `revision-${role}@example.test`;
		await sql`INSERT INTO users(id,email,name,hashed_password,role) VALUES(${id},${email},${"Revision " + role},${hash},'user')`;
		fixture.users[role] = { id, email };
	}
	await sql`INSERT INTO projects(id,name,slug,settings) VALUES(${fixture.projectId},'Revision Browser Test',${fixture.projectSlug},'{}')`;
	for (const role of ["editor", "viewer"])
		await sql`INSERT INTO project_members(project_id,user_id,role) VALUES(${fixture.projectId},${fixture.users[role].id},${role})`;
	const blocks = [
		{
			id: "initial",
			type: "paragraph",
			content: [
				{
					type: "text",
					text: "Original live fixture content",
					styles: {},
				},
			],
			children: [],
		},
	];
	await sql`INSERT INTO documents(id,project_id,slug,title,description,blocks,seo,published) VALUES(${fixture.documentId},${fixture.projectId},'guide/install','Installation','Original description',${sql.json(blocks)},${sql.json({ metaTitle: "Installation original" })},true),(${fixture.unpublishedId},${fixture.projectId},'guide/unpublished','Unpublished fixture',null,${sql.json(blocks)},'{}',false)`;
	await sql`INSERT INTO navigation(project_id,structure) VALUES(${fixture.projectId},${sql.json(
		{
			title: "Revision Docs",
			version: "1",
			routes: [
				{
					title: "Guide",
					slug: "guide",
					children: [
						{
							id: fixture.documentId,
							title: "Installation",
							slug: "guide/install",
							path: "/docs/guide/install",
						},
						{
							id: fixture.unpublishedId,
							title: "Unpublished fixture",
							slug: "guide/unpublished",
							path: "/docs/guide/unpublished",
						},
					],
				},
			],
		},
	)})`;
	fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));
	console.log("Fixture created: " + fixture.projectSlug);
	await sql.end();
})().catch(async (e) => {
	console.error(e);
	await sql.end();
	process.exitCode = 1;
});
