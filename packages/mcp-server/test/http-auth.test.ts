import assert from "node:assert/strict";
import test from "node:test";
import { createBearerGate } from "../src/bearer-auth.js";
import { createBearerMcpHandler } from "../src/http-handler.js";

const config = {
	token: "a-secure-test-token-that-is-at-least-32-characters",
	userId: "00000000-0000-0000-0000-000000000000",
	scopes: ["docs:read"],
};

test("bearer gate rejects missing and incorrect credentials", async () => {
	const gate = createBearerGate(config);
	const missing = await gate(new Request("http://localhost/mcp"));
	assert.ok(missing instanceof Response);
	assert.equal(missing.status, 401);
	assert.match(missing.headers.get("www-authenticate") ?? "", /^Bearer/);

	const wrong = await gate(
		new Request("http://localhost/mcp", {
			headers: { authorization: "Bearer wrong-token" },
		}),
	);
	assert.ok(wrong instanceof Response);
	assert.equal(wrong.status, 401);
});

test("bearer gate accepts the configured token and preserves scopes", async () => {
	const gate = createBearerGate(config);
	const result = await gate(
		new Request("http://localhost/mcp", {
			headers: { authorization: `Bearer ${config.token}` },
		}),
	);
	assert.ok(!(result instanceof Response));
	assert.equal(result.clientId, config.userId);
	assert.deepEqual(result.scopes, config.scopes);
	assert.ok((result.expiresAt ?? 0) > Date.now() / 1000);
});

test("HTTP MCP handler protects /mcp before invoking tools", async () => {
	const handler = createBearerMcpHandler({
		service: {} as never,
		...config,
		allowedHosts: ["docstudio.themegrill.com"],
		allowedOrigins: ["docstudio.themegrill.com"],
	});
	const unauthorized = await handler.fetch(
		new Request("https://docstudio.themegrill.com/mcp", {
			headers: { host: "docstudio.themegrill.com" },
		}),
	);
	assert.equal(unauthorized.status, 401);
	const wrongHost = await handler.fetch(
		new Request("https://attacker.example/mcp", {
			headers: {
				host: "attacker.example",
				authorization: `Bearer ${config.token}`,
			},
		}),
	);
	assert.equal(wrongHost.status, 403);
	await handler.close();
});
