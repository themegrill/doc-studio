#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import {
	createDatabase,
	DocumentService,
	type ActorContext,
} from "@doc-studio/core";
import { buildServer } from "./server.js";

const userId = process.env.DOC_STUDIO_MCP_USER_ID;
if (!userId) {
	console.error("DOC_STUDIO_MCP_USER_ID is required");
	process.exit(1);
}
const sql = createDatabase();
const scopes = (
	process.env.DOC_STUDIO_MCP_SCOPES ??
	"projects:read,docs:read,docs:write,docs:publish,docs:delete"
)
	.split(",")
	.map((v) => v.trim())
	.filter(Boolean);
const actor: ActorContext = { userId, scopes, transport: "stdio" };
const handle = serveStdio(() => buildServer(new DocumentService(sql), actor));
const shutdown = async () => {
	await handle.close();
	await sql.end();
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
