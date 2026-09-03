# Doc Studio MCP server

Bearer-token-protected MCP server for project, document, navigation, section, SEO, publishing, trash, and guarded purge operations. It supports Streamable HTTP and trusted local stdio.

## Runtime contract

- Node 20 or newer (tested with Node 26)
- `@modelcontextprotocol/server` 2.0.0 and Zod 4
- MCP 2026-07-28-compatible stdio via `serveStdio(factory)`
- PostgreSQL from `DATABASE_URL`
- Actor identity from `DOC_STUDIO_MCP_USER_ID`; callers cannot supply identity as a tool argument
- Optional comma-separated `DOC_STUDIO_MCP_SCOPES` (defaults to the documented local full-access scope set)
- `DOC_STUDIO_MCP_CONFIRMATION_SECRET` is required only for purge preview/confirmation

## Bearer-authenticated HTTP

```bash
export DATABASE_URL='postgres://...'
export DOC_STUDIO_MCP_USER_ID='00000000-0000-0000-0000-000000000000'
export DOC_STUDIO_MCP_BEARER_TOKEN='replace-with-at-least-32-random-characters'
export DOC_STUDIO_MCP_SCOPES='projects:read,docs:read,docs:write,docs:publish,docs:delete'
pnpm --filter @doc-studio/mcp-server build
pnpm --filter @doc-studio/mcp-server start:http
```

The default endpoint is `http://127.0.0.1:3100/mcp`. Every request must include `Authorization: Bearer <token>`. The token authenticates `DOC_STUDIO_MCP_USER_ID`; project RBAC and scopes still authorize every tool call.

For deployment, configure `DOC_STUDIO_MCP_HOST`, `DOC_STUDIO_MCP_PORT`, `DOC_STUDIO_MCP_ALLOWED_HOSTS`, and `DOC_STUDIO_MCP_ALLOWED_ORIGINS`, and terminate TLS in front of the server. Rotate the token through the environment and restart. Never put it in a URL, repository, tool argument, or log.

## Local stdio

Build with `pnpm --filter @doc-studio/mcp-server build`, then configure an MCP client to run `node /absolute/path/packages/mcp-server/dist/stdio.js`. Protocol messages use stdout; diagnostics use stderr.

The configured user must exist and have the required project role. Viewer is required for reads, editor for normal writes, and admin for permanent purge. Slugs locate projects; document UUIDs are required for mutation.

Scope checks fail closed: a defined empty scope list grants nothing. Undefined scopes are trusted only for the in-process `web` transport; stdio and future HTTP actors must always provide an explicit list. Creating an already-published document requires both `docs:write` and `docs:publish`. Reading trash requires `docs:read`, `docs:delete`, and editor project access.

Document/section slug segments are canonical lowercase kebab-case. MCP BlockNote payloads are strict objects bounded to 500 top-level blocks, 2,000 total blocks, 10 child levels, 20 JSON levels, and 1 MB serialized data.

The HTTP transport uses a pre-shared bearer token rather than OAuth discovery. NextAuth cookies are not MCP credentials.
