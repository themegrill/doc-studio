import {
	createMcpHandler,
	hostHeaderValidationResponse,
	originValidationResponse,
} from "@modelcontextprotocol/server";
import { type ActorContext, type DocumentService } from "@doc-studio/core";
import { createBearerGate } from "./bearer-auth.js";
import { buildServer } from "./server.js";

export interface BearerMcpHandlerConfig {
	service: DocumentService;
	token: string;
	userId: string;
	scopes: string[];
	allowedHosts: string[];
	allowedOrigins: string[];
	path?: string;
}

export function createBearerMcpHandler(config: BearerMcpHandlerConfig) {
	if (config.token.length < 32) {
		throw new Error("MCP bearer token must be at least 32 characters");
	}
	const gate = createBearerGate(config);
	const handler = createMcpHandler((context) => {
		if (!context.authInfo) {
			throw new Error("Authenticated HTTP context is required");
		}
		const actor: ActorContext = {
			userId: config.userId,
			scopes: context.authInfo.scopes,
			transport: "http",
		};
		return buildServer(config.service, actor);
	});

	return {
		async fetch(request: Request): Promise<Response> {
			if (new URL(request.url).pathname !== (config.path ?? "/mcp")) {
				return new Response("Not found", { status: 404 });
			}
			const rejected =
				hostHeaderValidationResponse(request, config.allowedHosts) ??
				originValidationResponse(request, config.allowedOrigins);
			if (rejected) return rejected;
			const auth = await gate(request);
			if (auth instanceof Response) return auth;
			return handler.fetch(request, { authInfo: auth });
		},
		close: () => handler.close(),
	};
}
