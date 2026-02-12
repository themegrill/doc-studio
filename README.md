# Doc Studio

AI-powered documentation builder with rich text editing, authentication, and PostgreSQL database.

## Features

- 📝 Rich text editing with BlockNote
- 🔐 Authentication with NextAuth 5.0
- 🗄️ PostgreSQL database with JSONB storage
- 🎨 Clean, Notion-like UI
- 🔍 Easy navigation
- 🐳 Docker-based development environment
- 🤖 AI-powered assistance (coming soon)

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Editor:** BlockNote
- **Authentication:** NextAuth 5.0
- **Database:** PostgreSQL with postgres.js
- **Styling:** Tailwind CSS + shadcn/ui
- **Language:** TypeScript
- **Infrastructure:** Docker Compose

## Getting Started

### Prerequisites

- Node.js 18 or higher
- pnpm package manager
- Docker and Docker Compose
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/themegrill/docs-builder.git
cd tg-docs-builder

# Install dependencies
cd packages/web
pnpm install

# Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your configuration

# Start PostgreSQL database
pnpm db:start

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
doc-studio/
├── docker-compose.yml       # PostgreSQL container setup
├── packages/
│   └── web/                 # Next.js application
│       ├── app/             # App router pages & API routes
│       ├── components/      # React components
│       ├── lib/             # Utilities and helpers
│       ├── db/              # Database schemas and migrations
│       │   └── init.sql     # Initial database setup
│       └── types/           # TypeScript type definitions
└── pnpm-workspace.yaml
```

## Database Management

The project uses PostgreSQL with the following tables:

- **users** - User accounts for authentication
- **documents** - Documentation pages with BlockNote blocks (JSONB)
- **navigation** - Navigation structure (JSONB)

### Database Commands

```bash
# Start database
pnpm db:start

# Stop database
pnpm db:stop

# Reset database (warning: deletes all data)
pnpm db:reset

# View database logs
pnpm db:logs
```

### Database Connection

Default local development credentials:

- **Host:** localhost
- **Port:** 5432
- **Database:** tg_docs_db
- **User:** tg_docs_user
- **Password:** tg_docs_password

## Content Management

Documents are stored in the PostgreSQL database with the following structure:

- **slug** - URL-friendly identifier
- **title** - Document title
- **description** - Optional description
- **blocks** - BlockNote content (stored as JSONB)
- **published** - Publication status
- **order_index** - Display order

Content is managed through the web interface with full CRUD operations.

## Development

### Running Locally

```bash
cd packages/web
pnpm dev
```

### Building for Production

```bash
cd packages/web
pnpm build
pnpm start
```

### Available Scripts

From `packages/web`:

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm db:start` - Start PostgreSQL container
- `pnpm db:stop` - Stop PostgreSQL container
- `pnpm db:reset` - Reset database and start fresh
- `pnpm db:logs` - View PostgreSQL logs

## Authentication

The project uses NextAuth 5.0 for authentication. Configure your auth providers in `packages/web/app/api/auth/[...nextauth]/route.ts`.

### Environment Variables

Required environment variables in `.env.local`:

```env
# Database
DATABASE_URL=postgres://tg_docs_user:tg_docs_password@localhost:5432/tg_docs_db

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here

# Add your OAuth providers here
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT

## Team

Maintained by [ThemeGrill](https://github.com/themegrill)
