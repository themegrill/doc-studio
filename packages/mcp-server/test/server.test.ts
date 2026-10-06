import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { buildServer } from "../src/server.js";
import { validateBlocks, type Block } from "@doc-studio/core";

test("advertises the complete narrow tool surface with JSON schemas", async () => {
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	const server = buildServer({} as never, {
		userId: "00000000-0000-0000-0000-000000000000",
		transport: "stdio",
	});
	const client = new Client({ name: "doc-studio-test", version: "1.0.0" });
	await Promise.all([
		server.connect(serverTransport),
		client.connect(clientTransport),
	]);
	const response = await client.listTools();
	const names = response.tools.map((tool) => tool.name);
	for (const required of [
		"projects_list",
		"docs_create",
		"docs_update",
		"docs_move",
		"sections_create",
		"sections_delete",
		"navigation_get",
		"seo_update",
		"sitemap_preview",
		"docs_purge",
		"docs_revisions_list",
		"docs_revision_get",
		"docs_revision_create",
		"docs_revision_update",
		"docs_revision_ready",
		"docs_revision_discard",
		"docs_revision_publish",
	])
		assert.ok(names.includes(required), `missing ${required}`);
	assert.equal(names.length, 34);
	assert.ok(
		response.tools.every((tool) => tool.inputSchema.type === "object"),
	);
	assert.ok(
		response.tools.every((tool) => tool.outputSchema?.type === "object"),
	);
	await client.close();
	await server.close();
});

const documentId = "00000000-0000-4000-8000-000000000001";
const revisionId = "00000000-0000-4000-8000-000000000002";
const text = { type: "text", text: "Doc tag", styles: {} };
const badge = { type: "proBadge", props: {} };
const legacyTable: Block = {
	id: "table", type: "table", props: { textColor: "default" },
	content: {
		type: "tableContent", columnWidths: [null, 180], headerRows: 1,
		rows: [{ cells: [[text, badge], [{ type: "link", href: "https://example.com", content: [text] }]] }],
	}, children: [],
};
const styledTable: Block = {
	id: "styled-table", type: "table",
	content: {
		type: "tableContent", columnWidths: [null, null], headerRows: 1, headerCols: 1,
		rows: [{ cells: [{
			type: "tableCell",
			props: { backgroundColor: "default", textColor: "default", textAlignment: "left", colspan: 2, rowspan: 1 },
			content: [text, badge],
		}] }],
	},
};
const heading: Block = {
	id: "heading", type: "heading", props: { level: 2 }, content: [text, badge],
	children: [legacyTable],
};

async function withDocument(
	blocks: Block[],
	run: (client: Client, saved: Block[][]) => Promise<void>,
) {
	const saved: Block[][] = [];
	const write = (patch: { blocks: Block[] }) => {
		validateBlocks(patch.blocks);
		saved.push(structuredClone(patch.blocks));
		return { id: documentId, blocks: patch.blocks };
	};
	const service = {
		getDocument: async () => ({ id: documentId, blocks: structuredClone(blocks) }),
		createDocument: async (_actor: unknown, _project: string, input: { blocks: Block[] }) => write(input),
		updateDocument: async (_actor: unknown, _project: string, _id: string, patch: { blocks: Block[] }) => write(patch),
		patchRevision: async (_actor: unknown, _project: string, _id: string, _revision: string, patch: { blocks: Block[] }) => write(patch),
	};
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const server = buildServer(service as never, { userId: documentId, transport: "stdio" });
	const client = new Client({ name: "block-roundtrip-test", version: "1.0.0" });
	try {
		await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
		await run(client, saved);
	} finally {
		await client.close();
		await server.close();
	}
}

for (const [name, blocks] of [
	["legacy table", [legacyTable]],
	["styled and merged table", [styledTable]],
	["Pro heading with nested table", [heading]],
] as const) {
	test(`${name} round-trips through all MCP document write tools unchanged`, async () => {
		await withDocument([...blocks], async (client, saved) => {
			const read = await client.callTool({ name: "docs_get", arguments: { projectSlug: "example", documentId } });
			assert.ok(!read.isError);
			const result = read.structuredContent?.result as { blocks: Block[] };
			for (const [tool, extra] of [
				["docs_create", { title: "Round trip", slug: "round-trip", section: "guide" }],
				["docs_update", { documentId }],
				["docs_revision_update", { documentId, revisionId, expectedEditVersion: "1" }],
			] as const) {
				const response = await client.callTool({ name: tool, arguments: { projectSlug: "example", ...extra, blocks: result.blocks } });
				assert.ok(!response.isError, JSON.stringify(response));
				assert.deepEqual(saved.at(-1), blocks);
			}
		});
	});
}

test("MCP rejects malformed table and inline content before writing", async () => {
	await withDocument([], async (client, saved) => {
		for (const content of [
			{ type: "tableContent", rows: [{ cells: [42] }] },
			{ type: "tableContent", rows: [], columnWidths: [-1] },
			{ type: "tableContent", rows: [], headerRows: 0.5 },
			{ type: "tableContent", rows: [], unexpected: true },
			[{ type: "proBadge", props: {}, unexpected: true }],
			[{ type: "unknownInline", props: {} }],
		]) {
			const response = await client.callTool({ name: "docs_revision_update", arguments: {
				projectSlug: "example", documentId, revisionId, expectedEditVersion: "1",
				blocks: [{ id: "invalid", type: "table", content }],
			} });
			assert.equal(response.isError, true);
		}
		assert.equal(saved.length, 0);
	});
});

test("table content remains subject to the core document size limit", () => {
	const large = structuredClone(legacyTable);
	if (!large.content || Array.isArray(large.content)) throw Error("Expected table");
	large.content.rows = Array.from({ length: 11 }, () => ({ cells: [[{ type: "text", text: "x".repeat(100_000), styles: {} }]] }));
	assert.throws(() => validateBlocks([large]), /1 MB limit/);
});
