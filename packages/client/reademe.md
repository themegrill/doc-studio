# packages/client

A standalone Next.js documentation viewer inside the monorepo. It does **not** have direct database access — all data is fetched from the main application's API.

---

## 📁 Structure

```
packages/client/
├── app/
│   ├── layout.tsx              # Root layout (SessionProvider, Toaster)
│   ├── globals.css             # Synced from packages/web
│   └── docs/
│       ├── layout.tsx          # Fetches navigation via API
│       └── [...slug]/page.tsx  # Fetches doc content via API
├── lib/
│   ├── api.ts                  # Server-side fetch helpers (getNavigation, getDoc)
│   └── db/ContentManager.ts    # Type-only stub (re-exports types from api.ts)
├── components/                 # Synced from packages/web
├── contexts/                   # Synced from packages/web
├── types/                      # Synced from packages/web
├── next.config.ts              # Rewrites /api/* → main app (API_BASE_URL)
├── package.json
├── tsconfig.json
└── .env.example
```

---

## ⚙️ Configuration

Copy `.env.example` to `.env` and update values:

```
API_BASE_URL=http://localhost:3000   # Main doc-studio app URL
PROJECT_SLUG=your-project-slug       # Target project identifier
NEXTAUTH_SECRET=same-as-main-app     # Shared auth session secret
```

---

## 🔄 Syncing

Client-side files are synced from `packages/web`.

Run:

```bash
# From repo root
pnpm --filter web sync-client

# Or from packages/client
pnpm sync

# Preview changes without writing
pnpm sync:dry
```

### Synced Items

- `components/docs`
- `components/auth`
- `components/chat`
- `components/ui`
- `components/providers`
- `contexts/EditingContext.tsx`
- `types/`
- `lib/utils.ts`
- `lib/parse-title-badges.ts`
- `lib/editor-tools.ts`
- `app/globals.css`

### Not Synced

These are **client-specific** and will not be overwritten:

- `app/docs/*`
- `lib/api.ts`

---

## 🏗️ Build & Run

```bash
cd packages/client
pnpm install
pnpm build
pnpm start
```

Runs on: **http://localhost:3001**
