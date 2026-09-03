import {
	DocumentService,
	DomainError,
	type ActorContext,
} from "@doc-studio/core";
import { getDb } from "@/lib/db/postgres";

export const documentService = () => new DocumentService(getDb());
export const webActor = (userId: string): ActorContext => ({
	userId,
	transport: "web",
	scopes: [
		"projects:read",
		"docs:read",
		"docs:write",
		"docs:publish",
		"docs:delete",
	],
});

export function domainErrorResponse(error: unknown) {
	if (!(error instanceof DomainError)) {
		console.error(error);
		return Response.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
	const status = {
		FORBIDDEN: 403,
		NOT_FOUND: 404,
		CONFLICT: 409,
		STALE_VERSION: 409,
		INVALID_INPUT: 400,
		CONFIRMATION_REQUIRED: 409,
	}[error.code];
	return Response.json(
		{ error: error.message, code: error.code, details: error.details },
		{ status },
	);
}
