import { createBearerMcpHandler } from "@doc-studio/mcp-server/http-handler";
import { DocumentService } from "@doc-studio/core";
import { getDb } from "@/lib/db/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const defaultScopes =
	"projects:read,docs:read,docs:write,docs:publish,docs:delete";
let handler: ReturnType<typeof createBearerMcpHandler> | undefined;

function getHandler() {
	if (handler) return handler;
	const token = process.env.DOC_STUDIO_MCP_BEARER_TOKEN;
	const userId = process.env.DOC_STUDIO_MCP_USER_ID;
	if (!token || !userId) {
		throw new Error("MCP bearer token and user ID are not configured");
	}
	const scopes = (process.env.DOC_STUDIO_MCP_SCOPES ?? defaultScopes)
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
	const allowedHosts = (
		process.env.DOC_STUDIO_MCP_ALLOWED_HOSTS ?? "docstudio.themegrill.com"
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
	handler = createBearerMcpHandler({
		service: new DocumentService(getDb()),
		token,
		userId,
		scopes,
		allowedHosts,
		allowedOrigins,
		path: "/mcp",
	});
	return handler;
}

function serve(request: Request) {
	try {
		return getHandler().fetch(request);
	} catch (error) {
		console.error("[MCP] Configuration error", error);
		return Promise.resolve(
			Response.json({ error: "MCP server is not configured" }, { status: 503 }),
		);
	}
}

export const GET = serve;
export const POST = serve;
export const DELETE = serve;
