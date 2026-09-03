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

## Connect to the hosted server

The production MCP endpoint is:

```text
https://docstudio.themegrill.com/mcp
```

Retrieve the **Doc Studio MCP bearer token** from Passbolt. Do not paste the
token into chat, tickets, screenshots, committed files, or shared shell
history.

### Claude Code

Store the token in an environment variable and register the server for your
user account:

```bash
export DOC_STUDIO_MCP_TOKEN='<token-from-passbolt>'

claude mcp add --transport http doc-studio \
  https://docstudio.themegrill.com/mcp \
  --scope user \
  --header "Authorization: Bearer $DOC_STUDIO_MCP_TOKEN"
```

Verify the connection:

```bash
claude mcp get doc-studio
claude mcp list
```

Inside Claude Code, use `/mcp` to inspect the connection and available tools.
See the [Claude Code MCP documentation](https://docs.anthropic.com/en/docs/claude-code/mcp)
for client-specific details.

### Codex CLI and IDE extension

Codex shares MCP configuration between its CLI and IDE extension. Export the
Passbolt token before starting Codex:

```bash
export DOC_STUDIO_MCP_TOKEN='<token-from-passbolt>'
```

Then add this to `~/.codex/config.toml`:

```toml
[mcp_servers.doc-studio]
url = "https://docstudio.themegrill.com/mcp"
bearer_token_env_var = "DOC_STUDIO_MCP_TOKEN"
```

Verify it with `codex mcp list` or `/mcp` inside Codex. See the
[official Codex MCP documentation](https://developers.openai.com/codex/extend/mcp).

### ChatGPT Desktop

ChatGPT Desktop, Codex CLI, and the Codex IDE extension share MCP configuration
for the same Codex host. Configure the server in `~/.codex/config.toml` exactly
as shown above, export `DOC_STUDIO_MCP_TOKEN`, and fully restart ChatGPT Desktop.

```toml
[mcp_servers.doc-studio]
url = "https://docstudio.themegrill.com/mcp"
bearer_token_env_var = "DOC_STUDIO_MCP_TOKEN"
```

Open the desktop app's MCP server settings to confirm that `doc-studio` is
enabled. The desktop app supports Streamable HTTP servers with bearer-token
authentication. See the [official OpenAI MCP documentation](https://learn.chatgpt.com/docs/extend/mcp).

### Claude Desktop

Claude Desktop can use account-level remote custom connectors, but that flow is
designed around OAuth and does not provide a field for an arbitrary static
`Authorization` header. The current Doc Studio server therefore cannot be added
directly through **Customize → Connectors** using the Passbolt bearer token.

For now, use Claude Code with the custom header instructions above. To support
Claude Desktop directly, Doc Studio must add OAuth discovery and an authorization
flow, or distribute a separately reviewed local desktop extension/bridge. Do not
enter the Passbolt bearer token as an OAuth client secret.

See Anthropic's [remote custom connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
and [desktop extension guide](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop).

### GitHub Copilot CLI

```bash
export DOC_STUDIO_MCP_TOKEN='<token-from-passbolt>'

copilot mcp add --transport http \
  --header "Authorization: Bearer $DOC_STUDIO_MCP_TOKEN" \
  doc-studio https://docstudio.themegrill.com/mcp

copilot mcp get doc-studio
```

See the [GitHub Copilot CLI MCP documentation](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers).

### Cursor, VS Code, Windsurf, and other MCP clients

These clients can use the server when they support remote Streamable HTTP and
custom request headers. Configuration-file names differ by client, but the
connection values are the same:

| Setting | Value |
| --- | --- |
| Name | `Doc Studio` |
| URL | `https://docstudio.themegrill.com/mcp` |
| Transport | HTTP / Streamable HTTP |
| Header | `Authorization: Bearer <token-from-passbolt>` |

A commonly supported JSON shape is:

```json
{
  "mcpServers": {
    "doc-studio": {
      "type": "http",
      "url": "https://docstudio.themegrill.com/mcp",
      "headers": {
        "Authorization": "Bearer ${DOC_STUDIO_MCP_TOKEN}"
      }
    }
  }
}
```

Some clients use `servers` instead of `mcpServers`, or prompt securely for
header values. Follow the client's MCP documentation and prefer its secret or
input mechanism over storing the Passbolt token directly in JSON.

Claude.ai custom web connectors primarily expect OAuth. Use one of the clients
above, or any other client that supports custom authorization headers, until
OAuth discovery is implemented for this server.

### Support and tool requests

Try the existing tools before requesting additions. If a tool fails or a new
capability is needed, [create a Doc Studio issue](https://github.com/themegrill/doc-studio/issues)
and include the tool name, expected behavior, actual behavior, timestamp, and
request ID when available. Never include the bearer token.

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
