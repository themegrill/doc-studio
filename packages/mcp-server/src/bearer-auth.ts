import { timingSafeEqual } from "node:crypto";
import {
	OAuthError,
	OAuthErrorCode,
	requireBearerAuth,
	type AuthInfo,
	type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";

function equalToken(actual: string, expected: string): boolean {
	const actualBytes = Buffer.from(actual);
	const expectedBytes = Buffer.from(expected);
	return (
		actualBytes.length === expectedBytes.length &&
		timingSafeEqual(actualBytes, expectedBytes)
	);
}

export function createStaticTokenVerifier(config: {
	token: string;
	userId: string;
	scopes: string[];
}): OAuthTokenVerifier {
	return {
		async verifyAccessToken(token: string): Promise<AuthInfo> {
			if (!equalToken(token, config.token)) {
				throw new OAuthError(
					OAuthErrorCode.InvalidToken,
					"Invalid bearer token",
				);
			}
			return {
				token,
				clientId: config.userId,
				scopes: config.scopes,
				// Static credentials are rotated through configuration. MCP's bearer
				// gate requires a future expiry on each verified AuthInfo object.
				expiresAt: Math.floor(Date.now() / 1000) + 300,
			};
		},
	};
}

export function createBearerGate(config: {
	token: string;
	userId: string;
	scopes: string[];
}) {
	return requireBearerAuth({ verifier: createStaticTokenVerifier(config) });
}
