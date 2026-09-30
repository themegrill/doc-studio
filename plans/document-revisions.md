# Document revisions — implementation plan

Source: [themegrill/user-registration-pro#1780](https://github.com/themegrill/user-registration-pro/issues/1780)

Prepared: 2026-09-30. Status: implemented and validated locally. No deployment, commit, or push performed; production rollout remains an operator step.

User/developer guide: [Document revisions](../docs/document-revisions.md). HTTP test harness: [Revision smoke tests](../packages/web/scripts/revisions/README.md).

### Implementation verification

- Additive migration: fresh install, upgrade, rerun, version-trigger behavior and cascade checks passed against isolated PostgreSQL.
- Core: 7 unit tests and 13 PostgreSQL integration scenarios passed; typecheck and build passed. Includes concurrent saves/publications, unchanged-content release, idempotent retries, section-overview title synchronization, atomic rollback, and restored publication history.
- MCP: 4 regression tests passed; build passed.
- HTTP: 35 authenticated/public API checks passed against the production web build, including strict inputs, roles/scopes, private headers, stale saves, public isolation, category search, readiness and publication retries.
- Browser: title/body/SEO editing, private preview/noindex, anonymous redirect, save-before-publish of unsaved metadata, same-URL release, history, stale conflict preservation, and unpublished-document publication verified.
- Delivery: public document/navigation/search return 200 with `Cache-Control: no-store`; standalone document and sitemap return 200. A staged marker stayed absent from the standalone client/search, then appeared on the next fresh request after publication without a rebuild. Fixture content was restored through history afterward.
- Builds: web and standalone client production Turbopack builds passed; client typecheck passed. The client build required an unsandboxed build subprocess and logged a nonfatal dynamic-render bailout for its not-found route; output routes are dynamic. Existing middleware-convention deprecation warnings remain.
- Production rollout, external deployment, and production load measurement have not been performed.

## Outcome

An editor can prepare a separate version of a published or unpublished document, save and preview it privately, and publish it when the product ships. Until publication, readers continue seeing the current document. Publishing preserves the previous content and records the product version, actor, and release time.

Example: “Installation” remains live for 2.0 while an editor prepares a 3.0 revision. Publishing that revision replaces the live content at the existing URL. The 2.0 content remains available in authenticated history.

## Recommended first-version decisions

- Keep `documents` as the current content read by the public site; store revisions separately.
- Allow multiple staged revisions per document, each with an optional product-version label and note. Labels are text, not a new product-release system or a semantic-version constraint.
- Support creating a revision from current content or a historical snapshot. A historical fork still records the *current* document version as its publication precondition.
- Stage title, description, BlockNote blocks, and the complete SEO object. Keep document UUID, URL/slug, section, and ordering attached to the document. Disable those structural controls inside revision editing. Structural changes remain separate operations and invalidate existing revision bases conservatively.
- Use manual **Publish revision**. Ready is an optional editorial marker, not an approval workflow. Editing a ready revision returns it to draft.
- Published snapshots are immutable. To restore older content, create a new draft from history and publish it through the same conflict checks.
- Retain explicit direct-current editing for compatibility, but label it **Update current** and preserve its history too. The new **Create revision** action is the staging entry point. Do not silently change existing MCP update tools into draft writes.
- Do not add scheduled publishing, release webhooks, atomic multi-document releases, public version selectors, automatic merges, or visual diffs in this first version.

## Phase 0 — Documentation discovery and verified foundations

Read these sources before implementing the associated phase. Findings below come from the current repository, rather than the older MCP plan or memory summaries.

| Source | Verified behavior / pattern to reuse |
| --- | --- |
| `packages/web/db/01-init.sql:63`, `10-seo-fields.sql:2`, `12-soft-delete.sql` | One mutable document row, UUID identity, project-scoped slug uniqueness, JSON blocks/SEO, soft deletion. No revision storage. |
| `packages/core/src/service.ts:75`, `:180` | `assertActorScope` and `DocumentService.project` enforce scopes and project role. |
| `packages/core/src/service.ts:344` | `patchDocument(actor, projectSlug, documentId, patch)` already performs transactional current-document edits, document row locking, optional stale checks, navigation updates, and redirects. |
| `packages/core/src/service.ts:271`, `:398` | Navigation JSON locking and title updates to copy into transaction-local helpers. |
| `packages/core/src/types.ts` | Shared `ActorContext`, `Block`, `SeoData`, `DomainError` definitions. |
| `packages/web/lib/documents/service.ts` | `documentService()`, `webActor(userId)`, `domainErrorResponse(error)` are existing route adapters. |
| `packages/web/app/api/docs/[...slug]/route.ts:133` | Existing web PUT delegates to the shared service. |
| `packages/web/components/docs/DocRenderer.tsx:1548`, `:1685` | Publish currently writes the current row with `published: true`; Save Draft writes that same row with `published: false`. Neither is revision staging. |
| `packages/web/components/docs/DocsLayoutClient.tsx:134`, `packages/web/contexts/EditingContext.tsx` | Existing toolbar, publishing warnings, and stable save callback patterns. |
| `packages/web/lib/db/ContentManager.ts:94`, `:124`, `:483` | Public reads filter published/nondeleted documents; admin reads include unpublished current documents. |
| `packages/web/app/api/search/route.ts:46`, `packages/web/app/api/navigation/route.ts` | Public search/navigation derive from current documents. |
| `packages/client/lib/api.ts:150`, `:187` | Standalone site caches navigation fetches for 60 seconds and document fetches for 30 seconds. This is a separate deployment. |
| `packages/web/db/migrate-on-build.mjs`, `packages/web/db/run-production-database-migration.js` | Prebuild schema steps and numbered SQL must agree; production runner separately tracks numbered files. |
| `packages/core/test/navigation.test.ts`, `packages/core/package.json` | Existing `tsx --test` test convention and core build/typecheck scripts. |
| `packages/mcp-server/src/server.ts` | Existing document update/publish/SEO tools invoke the same core service. |

Allowed existing APIs: `DocumentService`, `sql.begin(async db => ...)`, parameterized tagged SQL, `db.json(...)`, `SELECT ... FOR UPDATE`, `validateBlocks`, `DomainError`, `documentService`, `webActor`, and `domainErrorResponse`. New revision methods below are proposed APIs, not existing ones.

Discovery verification:

- Recheck line locations and relevant nested instructions when starting implementation.
- Audit every current-document SQL write, including section rename, navigation reorder, sample-data/import, trash, and purge paths. Distinguish content writes from structural writes.
- Confirm deployed schema and migration ordering using an isolated database before applying changes.
- Review PostgreSQL trigger and transaction behavior against the installed database version if new SQL behavior is uncertain; no new application framework dependency is required.

Guards: do not revive legacy `ContentManager.saveDoc` (no active call sites found), assume `db:migrate` applies numbered migrations (it currently runs a narrow legacy utility), or copy session-only page access as revision authorization.

## Phase 1 — Add revision storage and reliable version tokens

Create `packages/web/db/14-document-revisions.sql` and the equivalent prebuild migration step. Keep this additive and idempotent.

### Proposed schema

Add `documents.content_version BIGINT NOT NULL DEFAULT 1`. Use a database trigger to increment it when title, description, blocks, SEO, slug, publication state, or deletion state actually changes. Compare with `IS DISTINCT FROM`; do not bump for timestamp-only writes. This catches structural and legacy SQL writers as well as service writes. API tokens should serialize the BIGINT as a decimal string.

Add `document_revisions` with:

- `id`, `document_id` (FK with cascade on permanent deletion), per-document `revision_number` with a unique constraint;
- `title`, nullable `description`, `blocks`, `seo` as full snapshots;
- `status`: `draft`, `ready`, `released`, `historical`, or `discarded`;
- `product_version` and `release_note`, both nullable;
- `source_revision_id` for history forks (nullable self-reference), `base_document_version`, and `edit_version` starting at 1;
- `applied_document_version` for snapshots that represented a current row, plus `was_published` and a captured slug for historical context;
- `created_by`, `updated_by`, `released_by`, timestamps, `released_at`, nullable `superseded_at`, and `captured_at` for imported/baseline history.

Revision identity/number and optional product version are different concepts. Determine “Current” by matching `applied_document_version` to the current document version, not by choosing the latest created draft. Always show the actual current document separately, even if an older structural writer left no matching snapshot.

Allocate revision numbers while holding the parent document lock. Add indexes for `(document_id, revision_number DESC)` and active draft/ready listing. Multiple active drafts are permitted. Do not add full document bodies to list responses.

Create the baseline snapshot lazily in the first revision/history-changing transaction, avoiding a bulk content rewrite during migration. Preserve unpublished source content as `historical` with `was_published=false`; it must never look like a prior live release. For existing published content, record when it was captured and leave the historical release time/product label unknown rather than inventing them.

References: schema files and migration runners in Phase 0; copy existing user FK/null-on-user-delete conventions.

Verification:

- Fresh database and existing-database upgrade both work; rerunning migration changes nothing.
- Public document payloads remain identical after migration.
- Every relevant SQL writer bumps the document token; timestamp-only updates do not.
- Revision numbering stays unique under concurrent creates; trash retains history and hard deletion cascades it.

Guards: no database reset, no rewriting existing document UUIDs/slugs, no history baseline pretending to know past product versions, and no floating-point JSON representation of BIGINT tokens.

## Phase 2 — Implement revisions and atomic publication in core

Extend the existing shared service, extracting small transaction-local helpers where needed. Keep authorization and persistence inside core; do not implement a parallel write algorithm in route handlers.

Proposed operations:

```ts
listRevisions(actor, projectSlug, documentId, pagination)
getRevision(actor, projectSlug, documentId, revisionId)
createRevision(actor, projectSlug, documentId, input)
patchRevision(actor, projectSlug, documentId, revisionId, patch)
setRevisionReady(actor, projectSlug, documentId, revisionId, input)
discardRevision(actor, projectSlug, documentId, revisionId, input)
publishRevision(actor, projectSlug, documentId, revisionId, input)
```

All operations verify project membership and bind revision → document → project. Reads require viewer/`docs:read`; edits require editor/`docs:write`; publication additionally requires `docs:publish`. A trashed document is unavailable to ordinary revision operations.

Creation copies the full chosen snapshot and records the current document version. Patches change only explicitly supplied fields; preserve omitted content/SEO, and reuse existing SEO merge semantics for partial SEO patches. Publishing replaces the complete SEO snapshot so intentionally removed fields do not reappear. Validate title, label lengths, BlockNote structure/size, SEO shape, and allowed status transitions.

Require `expectedEditVersion` for draft saves, readiness, discard, and publish. Publish also requires `expectedDocumentVersion`, which must equal both the stored base and the current database token. Return the updated token after every mutation. Two tabs saving the same revision must produce a recoverable 409 rather than last-write-wins behavior.

### Publication transaction

1. Authorize; acquire document, revision, and navigation locks in a consistent order. Audit existing create/move/patch lock order and make overlapping paths consistent to avoid deadlocks.
2. Check parent is active, revision belongs to it, revision is draft/ready, and both version preconditions match.
3. Capture the previous current payload if no exact snapshot exists; close the previous known live interval. Preserve an unpublished previous version without labelling it live.
4. Copy title/description/blocks/SEO to `documents`, set `published=true`, and update actor/time. Keep UUID, slug, section, and ordering unchanged. Read the incremented content version back from the update.
5. Update navigation title, including section overview titles when applicable, within the same transaction.
6. Freeze the revision as released; set applied version, actor, product label, and release timestamp. The prior released snapshot remains immutable content in history.
7. Commit and return revision/current-document identifiers and version tokens. Do not perform external network calls inside the transaction.

A repeat publish request for an already released revision returns its original release result without applying its content again. If a newer release is now current, the response must say so. Simultaneous publication of two drafts from the same base permits only one winner.

### Existing writes and history

- Integrate a history helper into `patchDocument`/`setPublished` so direct current updates and MCP writes snapshot the previous content, close the prior release interval, and record the new current content. A direct edit is a new history entry with an unknown/unassigned product label, not a rewrite of a labelled immutable snapshot.
- Explicit unpublish closes the live interval; republish records a new release occurrence. Staged saves never toggle `documents.published`.
- Route any active content-writing bypass found in Phase 0 through the same helper/service. Structural-only writers must at least invalidate draft bases via the trigger; do not expand into a full section-management rewrite.
- On base conflicts, preserve the staged draft and return current/version details. V1 offers “create a fresh revision from current and reapply changes”; do not silently rebase or provide an overwrite bypass.

References: `service.ts:344` for transactions and PATCH semantics; `:271`/`:398` for navigation; `types.ts` for errors and types.

Verification: PostgreSQL-backed tests for isolated saves, metadata preservation, draft-first publication, immutable history, direct edits, unpublish/republish, old-version forks, stale saves, simultaneous releases, idempotent retries, project isolation, and rollback on navigation/history failure.

Guards: no nested transaction by calling the public `patchDocument` from inside another transaction; no service call that publishes before recording history; no readiness flag treated as authorization; no automatic merge.

## Phase 3 — Add authenticated API and preview routes

Under `/api/projects/[projectSlug]/documents/[documentId]/revisions`, add:

- `GET` list and `POST` create;
- `GET`/`PATCH` on `/[revisionId]`;
- `POST` on `/[revisionId]/ready`, `/discard`, and `/publish` (ready payload can also return to draft).

Parse inputs with the existing Zod dependency and map typed errors consistently: 401 missing session, 403 insufficient role/scope, 404 missing or mismatched resource, 409 stale/invalid transition, 400 invalid payload. Cross-project revision IDs must never return revision content.

Add authenticated editor/preview pages under `/projects/[projectSlug]/revisions/[documentId]/[revisionId]` and `/preview`. Use the existing renderer in read-only mode for preview, with a clear unpublished-preview banner. Require project access in the page/service, use private/no-store responses and noindex metadata, and keep revisions out of public document endpoints, navigation, sitemaps, and search. No bearer/shareable preview links in V1.

References: existing document route and `lib/documents/service.ts`; `DocRendererClient.tsx`/`DocRenderer.tsx` for rendering. Verify the actual renderer props before extracting shared rendering code.

Verification: endpoint tests for role matrix, missing sessions, cross-project IDs, trashed parents, invalid payloads, edit tokens, and anonymous access to editor/preview. Public GET must still return only current published content.

Guards: no `?revisionId=` bypass on the public document API, no Host/Referer-derived tenant for new mutation routes, no session-exists-only preview checks.

## Phase 4 — Add revision editing, readiness, and history UI

Reuse the existing BlockNote editor, SEO panel, editorial warnings, buttons/dialogs, and save-callback patterns. Add a small revision-aware editor adapter rather than duplicating the full renderer.

- Document actions: **Create revision** and **Revisions & history** for both published and unpublished documents.
- Revision list: current document first, drafts/ready revisions next, then history; show revision number, optional product version, status, author, and timestamps with pagination.
- Revision editor: prominent “Draft revision — current document is unchanged” state, editable product version/note, **Save revision**, **Preview**, **Mark ready**, **Publish revision**, and **Discard**.
- Hide slug/move/section controls in this context. Section-overview revision saves must not call the current section-title PATCH route; synchronize the title only at publication.
- Publishing shows the selected revision and optional product version. If unsaved changes exist, save first and publish only the returned edit version; stop on save failure. Preserve existing editorial warning behavior without making readiness a mandatory approval gate.
- Published document controls distinguish **Update current** from staged editing. Existing Save Draft/unpublish behavior must not be reused as “Save revision”; label explicit unpublish separately.
- Conflicts keep the user's unsaved content visible and provide reload/current-version guidance. Do not clear the editor or dirty state after a failed save/publication.
- History rows open immutable previews and offer **Create revision from this version**. Do not allow editing a released row or applying history directly to live content.

References: `DocRenderer.tsx:1548/:1685`, `DocsLayoutClient.tsx`, `EditingContext.tsx`, `SeoPanel.tsx`, and existing dialog primitives.

Verification: exercise published/unpublished documents and section overviews; dirty-state cancellation; failed saves; two editor tabs; preview; readiness reset after edits; successful publish; history fork; preserved navigation order; unchanged public title/SEO while staged.

Guards: no `published:false` call from revision save, no revision UI copied into the standalone public client, no premature section-title/navigation update.

## Phase 5 — Public delivery and existing integrations

Keep public content selection on `documents`; do not union revisions into current queries. Verify public pages, metadata/JSON-LD, navigation, search, sitemap, and any docs-derived AI knowledge flow all see the same promoted content and never stage private revisions.

Resolve standalone-client cache behavior explicitly. Recommended V1: switch the client document and navigation fetches to `cache: 'no-store'` so a new request after publication receives current content from DocStudio. Keep unrelated project/integration settings caching. Verify route-level/CDN caching and public search/sitemap paths too. This trades additional API reads for predictable publication; measure request impact in staging. Existing open browser tabs still require navigation/reload. If caching is retained instead, a tested cross-deployment invalidation mechanism is required before claiming immediate release visibility; local `revalidatePath` alone is insufficient.

Deploy compatible standalone-client changes alongside the feature. Do not call deployment automatically when publishing one revision. If a separately maintained AI index is asynchronous, show/document its refresh status and verify that refresh consumes published documents only.

MCP first-version scope: retain existing tools and verify they participate in history/conflict handling. Dedicated revision tools are a follow-up adapter over the new core methods, not required for the issue's web workflow. Document that existing `docs_update` still edits current content.

References: `packages/client/lib/api.ts`, client catch-all page and sitemap, web public API routes, `packages/mcp-server/src/server.ts`, and `packages/web/scripts/sync-client.js` (viewer/editor components are intentionally not blindly synced).

Verification: a saved staged revision changes none of the public surfaces; promotion changes content/title/SEO/navigation at the same URL on the next fresh request; standalone deployment works without rebuild-per-release; existing MCP edits retain history and make older drafts conflict.

Guards: no success claim based only on an editor refresh, no private revision data in public caches or AI indexes, no application deployment coupled to the publication transaction.

## Phase 6 — Acceptance tests and rollout

Add real PostgreSQL service integration tests using the existing `tsx --test` convention and an isolated test database. Introduce a separately named integration-test script that requires a test database URL and refuses a non-test target. Keep existing unit tests runnable without a database. Add focused route and UI coverage using available repository infrastructure; use a browser checklist where no automation exists.

Acceptance scenarios:

1. Fork a published document; change title, blocks, description, and SEO. Save, reload, and preview. Public page, navigation, metadata, search, and sitemap remain unchanged.
2. Fork an unpublished document; it remains inaccessible publicly until publishing the revision. Verify the original unpublished content remains in history without a false publication date.
3. Mark ready, edit again, and verify status returns to draft. Publish and check current content, release label/actor/time, previous history, and public delivery.
4. Fork a historical version and release it as a new revision without mutating the old snapshot.
5. Save from two tabs and publish two drafts concurrently. Verify conflicts, preserved editor content, and exactly one successful base-version promotion.
6. Inject a failure after updating document content but before navigation/history completion; verify total rollback.
7. Retry a successful publish and ensure no duplicate release or accidental restoration over a newer release.
8. Direct web/MCP update, SEO edit, rename/move, unpublish, trash, restore, and purge preserve the documented history/conflict/deletion rules.
9. Viewer cannot edit/publish; another project's member and anonymous visitors cannot read private revisions or previews.
10. Verify section-overview revisions do not alter section titles until publication, and promotion preserves ordering and URL.

Run core unit/integration tests, MCP regression tests, package typechecks, targeted lint, and the web/client builds appropriate to the touched files. Read package scripts before execution: web build runs database migrations, so use the isolated database. Record pre-existing failures separately rather than expanding the feature scope.

Rollout order:

1. Additive schema/version trigger; verify existing application behavior.
2. Core history/revision methods and API behind a feature flag, with tests passing.
3. Editor/preview/history UI and compatible public-client delivery changes.
4. Enable on one internal project; complete all issue acceptance scenarios; then enable generally.

Rollback: disable revision creation/publication UI and endpoints, retaining revision tables/history. Current public content remains in `documents`. Fix forward if an older application would bypass newly added history tracking; do not drop revision data as a rollback procedure.

## Delivery slices

1. Schema + versioning + shared service + transactional tests.
2. Authenticated API + preview + editor/history UI.
3. Public delivery + integration regressions + staged rollout.

These are implementation slices, not separate user-facing features. The issue is complete only when all six acceptance criteria and the public-isolation/concurrency checks pass.
