import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { buildServer } from "../src/server.js";

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
	])
		assert.ok(names.includes(required), `missing ${required}`);
	assert.equal(names.length, 27);
	assert.ok(
		response.tools.every((tool) => tool.inputSchema.type === "object"),
	);
	assert.ok(
		response.tools.every((tool) => tool.outputSchema?.type === "object"),
	);
	await client.close();
	await server.close();
});
