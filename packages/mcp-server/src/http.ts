#!/usr/bin/env node
import { createServer } from "node:http";
import { createMcpHandler } from "@modelcontextprotocol/server";
import {
	hostHeaderValidation,
	originValidation,
	toNodeHandler,
} from "@modelcontextprotocol/node";
import {
	createDatabase,
	DocumentService,
	type ActorContext,
} from "@doc-studio/core";
import { createBearerGate } from "./bearer-auth.js";
import { buildServer } from "./server.js";

const defaultScopes =
	"projects:read,docs:read,docs:write,docs:publish,docs:delete";
const token = process.env.DOC_STUDIO_MCP_BEARER_TOKEN;
const userId = process.env.DOC_STUDIO_MCP_USER_ID;
if (!token || token.length < 32) {
	console.error(
		"DOC_STUDIO_MCP_BEARER_TOKEN is required and must be at least 32 characters",
	);
	process.exit(1);
}
if (!userId) {
	console.error("DOC_STUDIO_MCP_USER_ID is required");
	process.exit(1);
}

const scopes = (process.env.DOC_STUDIO_MCP_SCOPES ?? defaultScopes)
	.split(",")
	.map((value) => value.trim())
	.filter(Boolean);
const port = Number.parseInt(process.env.DOC_STUDIO_MCP_PORT ?? "3100", 10);
const host = process.env.DOC_STUDIO_MCP_HOST ?? "127.0.0.1";
const allowedHosts = (
	process.env.DOC_STUDIO_MCP_ALLOWED_HOSTS ?? "localhost,127.0.0.1,[::1]"
)
	.split(",")
	.map((value) => value.trim())
	.filter(Boolean);
const allowedOrigins = (
	process.env.DOC_STUDIO_MCP_ALLOWED_ORIGINS ?? allowedHosts.join(",")
)
	.split(",")
	.map((value) => value.trim())
	.filter(Boolean);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
	console.error("DOC_STUDIO_MCP_PORT must be a valid TCP port");
	process.exit(1);
}

const sql = createDatabase();
const service = new DocumentService(sql);
const gate = createBearerGate({ token, userId, scopes });
const mcpHandler = createMcpHandler((context) => {
	if (!context.authInfo)
		throw new Error("Authenticated HTTP context is required");
	const actor: ActorContext = {
		userId,
		scopes: context.authInfo.scopes,
		transport: "http",
	};
	return buildServer(service, actor);
});
const nodeHandler = toNodeHandler(
	{
		async fetch(request: Request): Promise<Response> {
			if (new URL(request.url).pathname !== "/mcp")
				return new Response("Not found", { status: 404 });
			const auth = await gate(request);
			if (auth instanceof Response) return auth;
			return mcpHandler.fetch(request, { authInfo: auth });
		},
	},
	{ onerror: (error) => console.error(error) },
);
const validateHost = hostHeaderValidation(allowedHosts);
const validateOrigin = originValidation(allowedOrigins);
const server = createServer((request, response) => {
	if (!validateHost(request, response) || !validateOrigin(request, response))
		return;
	void nodeHandler(request, response);
});

server.listen(port, host, () =>
	console.error(`Doc Studio MCP listening on http://${host}:${port}/mcp`),
);
const shutdown = async () => {
	server.close();
	await mcpHandler.close();
	await sql.end();
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
