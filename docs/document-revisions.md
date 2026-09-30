# Document revisions

Revisions let editors prepare documentation privately while readers continue seeing the current document. Publish a revision manually when its product release is ready. The previous content remains in authenticated history.

## Editor workflow

1. Open a published or unpublished document and choose **Create revision**. Save or cancel existing current-document edits first.
2. Edit the revision's title, description, content, and SEO. Optionally enter a product version and release note, then choose **Save revision**.
3. Use **Preview** to inspect the saved content. Preview requires project access and is excluded from search engines. It is not a shareable public link.
4. Optionally **Mark ready**. Saving further edits returns the revision to draft.
5. Choose **Publish revision** and confirm. Unsaved changes are saved first. Publication replaces current content at the same URL and records its author, product version, and release time.

Multiple drafts can exist. **Revisions & history** shows current content, staged revisions, and immutable snapshots. **Create revision from this version** forks a historical snapshot into a new draft; it never modifies the snapshot.

**Update current** still changes current content immediately and now preserves history. **Unpublish** removes current content from the public site. **Save revision** never unpublishes the current document. Revision editing keeps the document's URL, section, and ordering unchanged.

If another editor saves the same revision, or current content changes after the revision was created, the conflicting operation fails without overwriting content. Keep or copy unsaved work, create a fresh revision from current content, and reapply changes. There is no automatic merge or overwrite bypass. A successful publish retried after a newer release does not restore the older release.

## Access and visibility

Project viewers can inspect revisions and previews; editors can create, edit, and publish them. API scope checks also apply to programmatic actors. Released, historical, and discarded snapshots are read-only. Trashing a document retains its revisions; permanent deletion removes them. Restoring a published document records a new live history occurrence.

The public document API, navigation, search, sitemap, metadata, and structured data read only the current published document. Draft revisions are never included in those queries. Existing MCP tools continue editing current content and participate in history; dedicated MCP revision tools are not included.

## Deployment and configuration

Apply `packages/web/db/14-document-revisions.sql` before enabling the new application against an existing database. It adds `documents.content_version`, a version trigger, and `document_revisions`; it does not rewrite current content or eagerly copy every document. The migration is additive and rerunnable.

The normal web build runs `db/migrate-on-build.mjs`, which reads this numbered migration when `DATABASE_URL` is present. If build-time database access is unavailable, apply the SQL through the normal database migration process before runtime. The production numbered migration runner uses `NEON_DATABASE_URL` and tracks applied SQL files. `pnpm db:migrate` is a separate legacy utility and is not the numbered-migration runner. Do not reset an existing database to install this feature.

Configure these variables on the web application:

| Variable                                                      | Behavior                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `DOC_STUDIO_REVISIONS_ENABLED=false`                          | Hide revision entry points and return 404 for revision pages/APIs. The default is enabled. |
| `DOC_STUDIO_REVISIONS_PROJECTS=internal-docs,another-project` | Restrict revision pages/APIs to these project slugs. Empty/unset permits all projects.     |

A conservative rollout applies the schema first, enables selected internal projects with the allowlist, validates their workflows, then removes the allowlist. To roll back the UI/API, set the enabled flag to false and retain all revision/history data. The public site continues reading `documents`. Existing direct-current writes still need the new schema because they record history even when revision entry points are disabled.

Deploy the standalone `packages/client` update too. Its document and navigation requests now use `cache: 'no-store'`; public document/navigation/search APIs send `Cache-Control: no-store`. The standalone document pages and sitemap already render dynamically. A new request after publication receives current content without rebuilding or redeploying for each release; existing open tabs still need navigation or reload. Project and integration settings retain their existing caching. More API reads are expected, so observe load during rollout. Do not add a CDN override that caches these responses.

The standalone client's `API_BASE_URL` and `PROJECT_SLUG` are embedded by its Next configuration at build time. Use the correct values for each client deployment. Publication itself makes no deployment or external network call.

## AI knowledge bases

The current knowledge-base loader reads separately maintained project knowledge-base records or legacy JSON files. Its `docs-site` source is imported documentation, including BetterDocs CSV content; it does not query `document_revisions` or automatically rebuild from a publication. Staged revisions are not added to the shared knowledge base. Authenticated editor assistance can still receive the revision being edited as context.

Publishing documentation does not refresh imported AI knowledge automatically. Refresh that source through the existing project knowledge-base controls when needed, using public published material. Its settings/status are independent of the document's release status; do not interpret a successful publication as confirmation that imported AI content is current.

## Validation

Core unit tests do not need a database:

```bash
pnpm --filter @doc-studio/core test
pnpm --filter @doc-studio/core typecheck
pnpm --filter @doc-studio/mcp-server test
```

Integration tests require an isolated PostgreSQL database whose name contains a separate `test` component. They apply schema migrations and create/delete their own fixtures. Never point them at development or production data.

```bash
DOC_STUDIO_TEST_DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/docstudio_test \
  pnpm --filter @doc-studio/core test:integration
```

The suite covers staging isolation, publication/history, metadata, readiness, concurrent saves/releases, identical-content publication, stale bases, project roles/scopes, history forks, retries, large version tokens, section overviews, rollback, and restore history. For authenticated HTTP checks, use the [35-check local smoke harness](../packages/web/scripts/revisions/README.md).

Run web/client typechecks and builds with the appropriate environment. Web builds migrate the configured database: use an isolated test target for validation, and stop a dev server before sharing its `.next` output with a build.

```bash
pnpm --dir packages/web exec tsc --noEmit
pnpm --dir packages/client exec tsc --noEmit
API_BASE_URL=http://localhost:3000 PROJECT_SLUG=YOUR_PROJECT pnpm --filter client build
```

Before release, verify both published and unpublished documents, a section overview, private preview as viewer/anonymous/another project's user, save failure, two-tab conflicts, save-before-publish, history restoration, and unchanged public title/body/SEO/navigation while staging. Check the separately deployed public client on a fresh request after publication.
