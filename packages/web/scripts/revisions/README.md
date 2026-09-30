# Revision HTTP smoke tests

Use an isolated, already migrated PostgreSQL database whose name contains a `test` component. The fixture creator refuses to overwrite an existing fixture project. It retains its users and documents for browser checks.

```sh
DOC_STUDIO_TEST_DATABASE_URL=postgresql://revisions_test:revisions_test@127.0.0.1:55439/tg_docs_revisions_test node packages/web/scripts/revisions/create-fixture.cjs
pnpm --dir packages/core build
DATABASE_URL=postgresql://revisions_test:revisions_test@127.0.0.1:55439/tg_docs_revisions_test AUTH_SECRET=local-revision-test-secret AUTH_URL=http://localhost:3107 DOC_STUDIO_REVISIONS_ENABLED=true pnpm --dir packages/web dev --port 3107
# In another terminal:
node packages/web/scripts/revisions/check-api.cjs
```

The smoke test signs in through Credentials with isolated editor, viewer, and outsider accounts, then checks authorization, malformed requests, stale writes, response privacy headers, staged public isolation, readiness, release, and retry. It leaves a fresh draft for browser verification. Fixture credentials are local test values only.

Optional environment variables: `REVISION_FIXTURE_PATH` (default `/tmp/docstudio-api-fixture.json`), `REVISION_TEST_ORIGIN` (default `http://localhost:3107`; only loopback hosts accepted).

Rollout checks: restart this server with `DOC_STUDIO_REVISIONS_ENABLED=false` and verify revision endpoints return 404 with private/no-store headers. Restore enabled and set `DOC_STUDIO_REVISIONS_PROJECTS=revision-browser-test`; excluded projects return 404, and the fixture project reaches normal authentication. Avoid running a web build against the same `.next` directory while the development server is active.
