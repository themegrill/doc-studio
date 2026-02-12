# Scripts Documentation

This directory contains utility scripts for managing the doc studio application. All scripts should be run from the `packages/web` directory.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Database Migrations](#database-migrations)
- [User Management](#user-management)
- [Project Management](#project-management)
- [Knowledge Base](#knowledge-base)
- [Common Workflows](#common-workflows)

---

## Prerequisites

Before running any scripts:

1. Make sure you're in the correct directory:

   ```bash
   cd packages/web
   ```

2. Ensure your `.env.local` file has the correct `DATABASE_URL`:

   ```
   DATABASE_URL="postgresql://..."
   ```

3. All scripts use `tsx` to run TypeScript directly:
   ```bash
   pnpm tsx scripts/<script-name>.ts
   ```

---

## Database Migrations

### `run-migration.ts`

Adds the `role` column to the `users` table for system-level permissions.

**Usage:**

```bash
pnpm tsx scripts/run-migration.ts
```

**What it does:**

- Adds `role` column with default value 'user'
- Creates index for better performance
- Updates existing users to have default role
- Verifies the migration was successful

**When to use:**

- Initial setup
- After pulling latest code that requires the role column
- Before deploying to production

---

### `check-migration.ts`

Verifies that the role column exists and shows user data.

**Usage:**

```bash
pnpm tsx scripts/check-migration.ts
```

**What it shows:**

- Whether role column exists
- Column type and default value
- List of users with their roles

**When to use:**

- After running migration to verify success
- To debug role-related issues

---

## User Management

### `make-admin.ts`

Promotes a user to system super_admin role.

**Usage:**

```bash
pnpm tsx scripts/make-admin.ts user@email.com
```

**What it does:**

- Finds user by email
- Updates their role to 'super_admin'
- Shows what permissions they now have

**Permissions granted:**

- Can access Users page
- Can create/edit/delete users
- Can access ALL projects (god mode)
- Can see system role dropdown in user dialogs

**When to use:**

- Setting up the first admin after deployment
- Promoting trusted users to admin status

---

### `set-user-password.ts`

Sets or resets a user's password.

**Usage:**

```bash
pnpm tsx scripts/set-user-password.ts user@email.com newpassword123
```

**What it does:**

- Hashes the password with bcrypt (10 rounds)
- Updates the user's hashed_password in database
- Verifies the update was successful

**When to use:**

- Resetting forgotten passwords
- Setting initial passwords for manually created users
- Testing login functionality

---

### `test-user-login.ts`

Tests if a user's credentials are valid.

**Usage:**

```bash
pnpm tsx scripts/test-user-login.ts user@email.com password123
```

**What it checks:**

- User exists in database
- User has a password set
- Password hash is valid
- Password matches

**When to use:**

- Debugging login issues
- Verifying password was set correctly
- After running set-user-password.ts

---

### `check-user-roles.ts`

Shows all users and their roles (both system and project roles).

**Usage:**

```bash
pnpm tsx scripts/check-user-roles.ts
```

**What it shows:**

- System roles from users table
- Project roles from project_members table
- Complete overview of all permissions

**When to use:**

- Auditing user permissions
- Understanding the role system
- Debugging access issues

---

## Project Management

### `add-me-as-owner.ts`

Adds a user as owner to all projects they're not already in.

**Usage:**

```bash
pnpm tsx scripts/add-me-as-owner.ts user@email.com
```

**What it does:**

- Finds all projects in the database
- Checks which ones you're not a member of
- Adds you as 'owner' to those projects
- Skips projects you're already in

**When to use:**

- After creating projects via database/scripts
- When you need access to test all projects
- Setting up a super user for testing

**Note:** Super admins don't need this - they auto-access all projects!

---

### `check-my-projects.ts`

Shows which projects you have access to and your roles.

**Usage:**

```bash
pnpm tsx scripts/check-my-projects.ts user@email.com
```

**What it shows:**

- Total projects in database
- Your projects with roles
- Projects you're NOT in
- Direct links to project settings

**When to use:**

- Checking your project access
- Debugging project visibility issues
- Before running add-me-as-owner.ts

---

## Knowledge Base

### `sync-knowledge-bases.ts`

Syncs knowledge base documentation from GitHub or local files.

**Usage:**

```bash
pnpm tsx scripts/sync-knowledge-bases.ts
```

**What it does:**

- Fetches documentation from configured sources
- Caches files locally for AI chat assistant
- Updates knowledge base for each project

**When to use:**

- Setting up documentation for AI features
- Updating cached documentation
- After adding new knowledge base sources

---

## Common Workflows

### 🚀 Initial Setup (Development)

```bash
# 1. Run database migration
pnpm tsx scripts/run-migration.ts

# 2. Make yourself super admin
pnpm tsx scripts/make-admin.ts your@email.com

# 3. Set your password
pnpm tsx scripts/set-user-password.ts your@email.com password123

# 4. Verify login works
pnpm tsx scripts/test-user-login.ts your@email.com password123

# 5. Add yourself to all projects (if needed)
pnpm tsx scripts/add-me-as-owner.ts your@email.com
```

### 🌐 Production Deployment

```bash
# 1. Set production DATABASE_URL
export DATABASE_URL="production-db-url"

# 2. Run migration
pnpm tsx scripts/run-migration.ts

# 3. Create first admin
pnpm tsx scripts/make-admin.ts admin@company.com

# 4. Set their password
pnpm tsx scripts/set-user-password.ts admin@company.com securepass123

# 5. Verify everything
pnpm tsx scripts/check-migration.ts
pnpm tsx scripts/check-user-roles.ts
```

### 🔧 Troubleshooting Login Issues

```bash
# 1. Check if user exists and has password
pnpm tsx scripts/test-user-login.ts user@email.com theirpassword

# 2. If no password, set one
pnpm tsx scripts/set-user-password.ts user@email.com newpassword

# 3. Test again
pnpm tsx scripts/test-user-login.ts user@email.com newpassword
```

### 👥 User Permission Audit

```bash
# 1. Check all user roles
pnpm tsx scripts/check-user-roles.ts

# 2. Check specific user's projects
pnpm tsx scripts/check-my-projects.ts user@email.com

# 3. Verify migration status
pnpm tsx scripts/check-migration.ts
```

### 🔐 Password Reset Workflow

```bash
# 1. Set new password
pnpm tsx scripts/set-user-password.ts user@email.com newpassword123

# 2. Verify it works
pnpm tsx scripts/test-user-login.ts user@email.com newpassword123

# 3. Notify user of new password
```

---

## Role System Overview

### System Roles (users table)

Controls access to system-wide features:

- **user** (default) - Regular user, no special permissions
- **admin** - Can manage all users, access all projects
- **super_admin** - Full system access (same as admin currently)

### Project Roles (project_members table)

Controls access per-project:

- **viewer** - Read-only access
- **editor** - Can edit documentation
- **admin** - Can manage project members
- **owner** - Full project control

### Permission Matrix

| Feature            | User | Admin/Super Admin |
| ------------------ | ---- | ----------------- |
| See Users page     | ❌   | ✅                |
| Create/edit users  | ❌   | ✅                |
| See all projects   | ❌   | ✅                |
| Access any project | ❌   | ✅                |
| Manage any project | ❌   | ✅                |

---

## Tips & Best Practices

### ✅ DO:

- Run `check-migration.ts` after migrations
- Test password changes with `test-user-login.ts`
- Keep one super_admin for emergencies
- Backup database before running scripts in production

### ❌ DON'T:

- Run multiple migrations simultaneously
- Make everyone a super_admin (defeats the purpose)
- Forget to set DATABASE_URL for production
- Store passwords in scripts or version control

---

## Troubleshooting

### Script fails with "User not found"

- Check email spelling (case-sensitive)
- Verify user exists: `pnpm tsx scripts/check-user-roles.ts`

### Script fails with "Database connection error"

- Check DATABASE_URL in .env.local
- Verify database is running
- Check network/firewall settings

### Migration fails with "Column already exists"

- Migration already ran successfully
- Verify with: `pnpm tsx scripts/check-migration.ts`
- Safe to ignore if column exists

### User can't log in

1. Run: `pnpm tsx scripts/test-user-login.ts user@email.com password`
2. If no password, run: `pnpm tsx scripts/set-user-password.ts`
3. If wrong password, reset it

---

## Need Help?

- Check the main README at `/packages/web/README.md`
- Review the code in `/packages/web/scripts/`
- Check database schema in `/packages/web/db/`

---

**Last Updated:** February 2026
