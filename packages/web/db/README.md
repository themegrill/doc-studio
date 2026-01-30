# Database Setup

This directory contains the database schema and migration files for the TG Docs Builder project.

## Local Development with Docker Postgres

### Prerequisites
- Docker and Docker Compose installed

### Starting the Database

1. **Start Postgres container:**
   ```bash
   docker-compose up -d
   ```

2. **Check if the database is running:**
   ```bash
   docker ps
   ```
   You should see `tg-docs-postgres` container running.

3. **View logs:**
   ```bash
   docker-compose logs -f postgres
   ```

### Connecting to the Database

The database is configured with the following credentials (for local development):

- **Host:** localhost
- **Port:** 5432
- **Database:** tg_docs_db
- **Username:** tg_docs_user
- **Password:** tg_docs_password
- **Connection String:** `postgres://tg_docs_user:tg_docs_password@localhost:5432/tg_docs_db`

### Database Schema

The `init.sql` file contains the initial schema:

- **users** - User accounts (for future NextAuth integration)
- **documents** - Documentation content with BlockNote editor data
- **navigation** - Site navigation structure

### Useful Commands

**Stop the database:**
```bash
docker-compose down
```

**Stop and remove all data:**
```bash
docker-compose down -v
```

**Access PostgreSQL CLI:**
```bash
docker exec -it tg-docs-postgres psql -U tg_docs_user -d tg_docs_db
```

**Reset database (recreate from scratch):**
```bash
docker-compose down -v
docker-compose up -d
```

## Production Setup (Digital Ocean)

When ready to connect to your Digital Ocean Postgres database:

1. Update the `DATABASE_URL` in `.env.local`:
   ```
   DATABASE_URL=postgres://username:password@your-do-host:port/database
   ```

2. Run the `init.sql` script on your DO database:
   ```bash
   psql $DATABASE_URL < packages/web/db/init.sql
   ```

3. No code changes needed - the app will automatically use the new connection.

## Migration Notes

- ✅ Database operations migrated from Supabase to Postgres
- ⚠️ Authentication still uses Supabase (will migrate to NextAuth.js later)
- The ContentManager now uses direct SQL queries via the `postgres` package
