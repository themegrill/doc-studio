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

## Use revisions in the web app

Sign in to Doc Studio, open the project, and open the document. Choose **Create revision** to start from the saved current content. If you have unsaved current-document edits, save or cancel them first; those edits are not copied into the revision.

On the revision page, edit the title, description, BlockNote content, SEO fields, product version, and release note. Choose **Save revision** to store a private copy without changing what readers see. **Preview** saves pending edits, then opens the revision in a private, noindex view. Choose **Mark ready** when it is ready for release; any later edit moves it back to draft. **Publish revision** asks for confirmation, saves pending edits, and replaces the current content at the same URL. **Discard** makes a draft read-only without changing the current document.

Use **Revisions & history** on the current document to see staged work and past snapshots. From a released or historical snapshot, choose **Create revision from this version** to start a new draft based on that content. Restoring an old version is done by publishing this new draft; history entries themselves cannot be edited.

## Use the revision API manually

The API uses the same signed-in Doc Studio session and project permissions as the web editor. It is not authenticated by the MCP bearer token. Substitute your project slug, document UUID, and revision UUID in the paths below. For brevity, `{R}` means `/api/projects/{projectSlug}/documents/{documentId}/revisions`:

| Operation | Request |
| --- | --- |
| Operation | Request |
| --- | --- |
| List revisions and current state | `GET {R}` |
| Create a draft from current content | `POST {R}` with `{}` |
| Fork a historical snapshot | `POST {R}` with `{"sourceRevisionId":"released-revision-uuid"}` |
| Read a revision | `GET {R}/{revisionId}` |
| Open the private browser preview | `/projects/{projectSlug}/revisions/{documentId}/{revisionId}/preview` |
| Save revision fields | `PATCH {R}/{revisionId}` |
| Mark ready or return to draft | `POST {R}/{revisionId}/ready` |
| Publish | `POST {R}/{revisionId}/publish` |
| Discard | `POST {R}/{revisionId}/discard` |

Creation accepts optional `productVersion` and `releaseNote`. A save must include the current `expectedEditVersion`; include only fields being changed:

```json
{
  "expectedEditVersion": "1",
  "title": "Install the product",
  "description": "Updated installation steps",
  "productVersion": "3.0",
  "releaseNote": "Documents the new setup flow"
}
```

To mark a revision ready, send `{"expectedEditVersion":"2","ready":true}`. To publish, send both tokens returned by the latest revision response: `{"expectedEditVersion":"3","expectedDocumentVersion":"7"}`. To discard, send `{"expectedEditVersion":"3"}`. Version values are decimal strings; use the latest returned values rather than incrementing them yourself. A stale token returns a conflict (`409`); fetch the latest revision state before retrying. If the current document changed after the draft was created, publishing is blocked until you create a fresh revision and reapply the changes.

Every revision response is private and `no-store`, and carries `X-Robots-Tag: noindex, nofollow`. Revision pages and previews require project membership. Viewers can read; editors can create and edit; publishing also requires publish permission.

## Use MCP with document history

MCP supports the staged workflow end to end with `docs_revisions_list`, `docs_revision_get`, `docs_revision_create`, `docs_revision_update`, `docs_revision_ready`, `docs_revision_discard`, and `docs_revision_publish`. These use the same core revision service, role checks, scopes, and concurrency protection as the web app. Read tools require `docs:read`; create, update, ready, and discard require `docs:write`; publish requires both `docs:write` and `docs:publish`.

To prepare a private change, first call `docs_get` with `{ "projectSlug": "your-project", "slug": "guide/install", "includeBlocks": true }` and note the document UUID. Call `docs_revision_create` with the project slug and document UUID; optionally include `productVersion` and `releaseNote`. To fork an earlier released snapshot, include its `sourceRevisionId`. Then call `docs_revision_update` with the draft's `revisionId`, the changed fields, and `expectedEditVersion` from the most recent revision result. For example:

```json
{
  "projectSlug": "your-project",
  "documentId": "00000000-0000-0000-0000-000000000000",
  "revisionId": "11111111-1111-4111-8111-111111111111",
  "expectedEditVersion": "1",
  "title": "Install the product",
  "releaseNote": "Clarify the installation steps"
}
```

Use `docs_revision_get` or `docs_revisions_list` to review saved work. The latest `editVersion` and `currentDocumentVersion` returned by those tools are decimal strings. To mark ready, call `docs_revision_ready` with `{ "expectedEditVersion": "2", "ready": true }`. To discard, call `docs_revision_discard` with the current edit token. To release, call `docs_revision_publish` with both the latest `expectedEditVersion` and `expectedDocumentVersion`; publishing makes the staged content live and obeys `docs:publish`. A stale token fails with a conflict, so fetch the revision again and reconcile rather than retrying with old tokens.

MCP can inspect and modify all structured revision fields, including title, description, BlockNote blocks, SEO, product version, and release note. The private visual preview remains available in the authenticated web app; MCP clients can inspect full revision data with `docs_revision_get` before publishing. Existing `docs_update`, `seo_update`, `docs_publish`, and `docs_unpublish` tools retain their immediate current-document behavior, so use the `docs_revision_*` tools whenever edits should remain staged.

MCP supports creating an unpublished document with `docs_create` and `published: false`, then publishing that document later. That is the document’s current unpublished state; it is different from a staged revision of an existing document.

## Access and visibility

Project viewers can inspect revisions and previews; editors can create and edit drafts; publishing requires publish permission. API scope checks also apply to programmatic actors. Released, historical, and discarded snapshots are read-only. Trashing a document retains its revisions; permanent deletion removes them. Restoring a published document records a new live history occurrence.

The public document API, navigation, search, sitemap, metadata, and structured data read only the current published document. Draft revisions are never included in those queries.

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
