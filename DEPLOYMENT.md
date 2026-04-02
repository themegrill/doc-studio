# Doc Studio — Deployment & Environment Setup

This guide covers every environment variable required to self-host Doc Studio on Vercel. Variables marked **Required** will break the app if missing. Variables marked **Optional** enable specific features or provide fallback overrides.

---

## Table of Contents

- [Quick Checklist](#quick-checklist)
- [Authentication](#authentication)
- [Database](#database)
- [AI (Anthropic)](#ai-anthropic)
- [GitHub / Knowledge Base](#github--knowledge-base)
- [Vercel Integration](#vercel-integration)
- [Vercel Blob Storage](#vercel-blob-storage)
- [Local Development Overrides](#local-development-overrides)
- [Variables That Are Auto-Set by Vercel](#variables-that-are-auto-set-by-vercel)
- [Full `.env.local` Template](#full-envlocal-template)

---

## Authentication

### `AUTH_SECRET`

**Required.** Secret used by NextAuth to sign and encrypt session tokens. Must be the same across all instances — changing it invalidates all existing sessions.

Generate a secure value:

```bash
openssl rand -base64 32
```

- Docs: https://authjs.dev/getting-started/deployment#auth_secret

### `NEXTAUTH_URL`

**Required for local development only.** The canonical URL of the app. On Vercel, this is inferred automatically from `VERCEL_URL`.

```env
NEXTAUTH_URL=http://localhost:3000
```

> On Vercel, do **not** set this unless you have a specific reason to override the deployment URL.

---

## Database

Doc Studio uses PostgreSQL. In production, [Neon](https://neon.tech) is recommended (serverless Postgres with connection pooling).

### `NEON_DATABASE_URL`

**Required in production.** Full connection string including SSL mode and channel binding.

```env
NEON_DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require&channel_binding=require
```

Steps:

1. Create a free account at https://neon.tech
2. Create a new project and database
3. Copy the **pooled connection string** from the Neon dashboard (Connection Details → Pooled connection)
4. Run the database migrations: `pnpm db:migrate` (or apply `packages/web/db/init.sql` manually)

### `DATABASE_URL`

**Local development only.** Points to the local Docker PostgreSQL instance.

```env
DATABASE_URL=postgres://tg_docs_user:tg_docs_password@localhost:5432/tg_docs_db
```

Start the local DB with `pnpm db:start` from `packages/web`.

---

## AI (Anthropic)

### `ANTHROPIC_API_KEY`

**Required** for AI-powered documentation features.

Steps:

1. Sign in at https://console.anthropic.com
2. Go to **API Keys** and create a new key
3. Copy the key — it is shown only once

- Docs: https://docs.anthropic.com/en/api/getting-started

```env
ANTHROPIC_API_KEY=sk-ant-api03-...
```

---

## GitHub / Knowledge Base

Doc Studio reads documentation source content from a GitHub repository.

### `GITHUB_TOKEN`

**Required.** A GitHub Personal Access Token (PAT) with read access to the knowledge base repository.

Steps:

1. Go to https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Select the `repo` scope (or just `public_repo` if the repo is public)
4. Copy the generated token

```env
GITHUB_TOKEN=ghp_...
```

### `KNOWLEDGE_BASE_REPO`

**Required.** The GitHub repository that contains the knowledge base content, in `owner/repo` format.

```env
KNOWLEDGE_BASE_REPO=themegrill/knowledge-base
```

### `KNOWLEDGE_BASE_BRANCH`

**Optional.** The branch to read content from. Defaults to `main`.

```env
KNOWLEDGE_BASE_BRANCH=main
```

---

## Vercel Integration

Doc Studio can automatically create and deploy per-project documentation sites on Vercel. This section covers the variables required for that feature.

### `VERCEL_API_TOKEN`

**Required for client deployments.** A Vercel API token scoped to the account or team where client documentation projects will be created.

Steps:

1. Go to https://vercel.com/account/tokens
2. Click **Create** and give it a name (e.g. `doc-studio-deploy`)
3. Set the scope to your team or personal account
4. Copy the token — it is shown only once

```env
VERCEL_API_TOKEN=vcp_...
```

> Keep this token server-side only. It grants the ability to create and deploy Vercel projects on your behalf.

### `VERCEL_TEAM_ID`

**Required if using a Vercel team account.** The ID of the Vercel team under which client projects should be created.

Steps:

1. Go to your Vercel team settings: https://vercel.com/teams
2. Copy the **Team ID** from the General settings page (starts with `team_`)

```env
VERCEL_TEAM_ID=team_...
```

Leave unset if you are deploying under a personal Vercel account.

### `VERCEL_ADMIN_PROJECT_ID`

**Recommended.** The Vercel project ID of this admin web app itself. Used to auto-detect the GitHub repository when triggering client deployments, so you do not need to set `VERCEL_GITHUB_REPO` manually.

Steps:

1. Open your project in the Vercel dashboard
2. Go to **Settings → General**
3. Copy the **Project ID** (starts with `prj_`)

```env
VERCEL_ADMIN_PROJECT_ID=prj_...
```

### `VERCEL_GITHUB_REPO`

**Optional.** Explicit override for the GitHub repository used as the source for client deployments, in `owner/repo` format.

```env
VERCEL_GITHUB_REPO=themegrill/doc-studio
```

If not set, the app auto-detects the repository from the admin project's deployment history via the Vercel API (requires `VERCEL_ADMIN_PROJECT_ID` to be set).

---

## Vercel Blob Storage

Doc Studio uses [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) for file storage (e.g. uploaded images and assets).

### `BLOB_READ_WRITE_TOKEN`

**Required for file uploads.** Grants read/write access to a Vercel Blob store.

**If deploying on Vercel (recommended):**

1. Open your project in the Vercel dashboard
2. Go to **Storage** → **Create Database** → **Blob**
3. Follow the prompts — Vercel will automatically inject `BLOB_READ_WRITE_TOKEN` into your project's environment variables

**If running locally:**

1. Install the Vercel CLI: `npm i -g vercel`
2. Link your project: `vercel link`
3. Pull environment variables: `vercel env pull .env.local`
   This will populate `BLOB_READ_WRITE_TOKEN` in your local `.env.local`

- Docs: https://vercel.com/docs/storage/vercel-blob/quickstart

```env
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

---

## Local Development Overrides

### `WEB_APP_URL`

**Local development only.** Explicitly sets the public URL of this admin app, which is passed to deployed client projects as their `API_BASE_URL`.

```env
WEB_APP_URL=http://localhost:3000
```

**Do not set this in Vercel environment variables.** In production, the app automatically uses `VERCEL_PROJECT_PRODUCTION_URL` (auto-set by Vercel) as the public URL.

---

## Variables That Are Auto-Set by Vercel

These are injected automatically by Vercel at build and runtime. You do not need to configure them.

| Variable                        | Value                                                  |
| ------------------------------- | ------------------------------------------------------ |
| `VERCEL_PROJECT_PRODUCTION_URL` | Canonical production domain (e.g. `my-app.vercel.app`) |
| `VERCEL_URL`                    | Deployment-specific URL (changes per deployment)       |
| `VERCEL_ENV`                    | `production`, `preview`, or `development`              |

---

## Full `.env.local` Template

Copy this to `packages/web/.env.local` and fill in your values:

```env
# ─── Authentication ───────────────────────────────────────────
# Generate with: openssl rand -base64 32
AUTH_SECRET=

# Required for local dev only — omit on Vercel
NEXTAUTH_URL=http://localhost:3000

# ─── Database ─────────────────────────────────────────────────
# Production: Neon PostgreSQL (pooled connection string)
NEON_DATABASE_URL=

# Local dev: Docker PostgreSQL
DATABASE_URL=postgres://tg_docs_user:tg_docs_password@localhost:5432/tg_docs_db

# ─── AI ───────────────────────────────────────────────────────
# https://console.anthropic.com → API Keys
ANTHROPIC_API_KEY=

# ─── GitHub / Knowledge Base ──────────────────────────────────
# https://github.com/settings/tokens (needs repo read scope)
GITHUB_TOKEN=
KNOWLEDGE_BASE_REPO=owner/repo-name
KNOWLEDGE_BASE_BRANCH=main

# ─── Vercel Integration (client project deployments) ──────────
# https://vercel.com/account/tokens
VERCEL_API_TOKEN=

# Required if using a Vercel team account
# VERCEL_TEAM_ID=team_...

# Vercel project ID of this admin app (Settings → General → Project ID)
# VERCEL_ADMIN_PROJECT_ID=prj_...

# Branch to deploy client projects from (default: main)
# VERCEL_DEPLOY_BRANCH=main

# Optional: explicit git source override
# VERCEL_GITHUB_REPO=owner/repo-name

# ─── Vercel Blob Storage ──────────────────────────────────────
# Auto-set on Vercel if a Blob store is linked. For local dev: run `vercel env pull`
BLOB_READ_WRITE_TOKEN=

# ─── Local Dev Overrides ──────────────────────────────────────
# Do NOT set WEB_APP_URL on Vercel — it is auto-detected from VERCEL_PROJECT_PRODUCTION_URL
WEB_APP_URL=http://localhost:3000
```
