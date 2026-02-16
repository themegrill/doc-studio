# Scripts Directory

Organized collection of utility and diagnostic scripts for the TG Docs Builder project.

## 📁 Structure

```
scripts/
├── utils/              Production-ready utility scripts
├── diagnostics/        Diagnostic and debugging tools
├── cleanup-scripts.sh  Script organization utility
└── README.md          This file
```

---

## 🛠️ Utils (Production Utilities)

Located in `scripts/utils/` - these scripts are used for regular operations:

### **sync-knowledge-bases.ts**
Syncs project documentation to AI knowledge bases for the chat assistant.
```bash
npx tsx scripts/utils/sync-knowledge-bases.ts
```

### **run-migration.ts**
Runs database migrations (adds role column, etc.).
```bash
npx tsx scripts/utils/run-migration.ts
```

### **make-admin.ts**
Promotes a user to admin/super_admin role.
```bash
npx tsx scripts/utils/make-admin.ts user@email.com
```

### **set-user-password.ts**
Sets or resets a user's password.
```bash
npx tsx scripts/utils/set-user-password.ts user@email.com newpassword123
```

---

## 🔍 Diagnostics (Debugging Tools)

Located in `scripts/diagnostics/` - these help diagnose issues:

### **diagnose-navigation.ts**
Shows complete navigation structure for all projects.
```bash
npx tsx scripts/diagnostics/diagnose-navigation.ts
```
**Shows:** All sections, children, paths, slugs, and title mismatches.

### **check-title-badges.ts**
Checks documents for HTML badge tags in titles.
```bash
npx tsx scripts/diagnostics/check-title-badges.ts
```
**Example:** `<span class="premium-feature">Pro</span>` → Displays as PRO badge

### **check-document-content.ts**
Inspects a specific document's blocks and content structure.
```bash
npx tsx scripts/diagnostics/check-document-content.ts
```
**Use for:** Debugging rendering issues or checking block format.

### **check-section-overviews.ts**
Checks which sections have overview documents.
```bash
npx tsx scripts/diagnostics/check-section-overviews.ts
```
**Shows:** Sections with/without overview docs for proper navigation.

---

## 🚀 Quick Start Workflows

### Initial Setup (Development)
```bash
# 1. Run database migration
npx tsx scripts/utils/run-migration.ts

# 2. Make yourself super admin
npx tsx scripts/utils/make-admin.ts your@email.com

# 3. Set your password
npx tsx scripts/utils/set-user-password.ts your@email.com password123
```

### Troubleshooting Navigation
```bash
# Check navigation structure
npx tsx scripts/diagnostics/diagnose-navigation.ts

# Check for badges in titles
npx tsx scripts/diagnostics/check-title-badges.ts

# Check section overviews
npx tsx scripts/diagnostics/check-section-overviews.ts
```

---

## 📝 Adding New Scripts

**Guidelines:**
- ✅ **Production utilities** → Place in `scripts/utils/`
- ✅ **Diagnostic tools** → Place in `scripts/diagnostics/`
- ❌ **One-time fixes** → Create, use, then delete (don't commit!)

Keep the repository clean - remove scripts after they've served their purpose.

---

## 🧹 Maintenance

### Reorganize Scripts
Run the cleanup script to organize and remove unnecessary files:
```bash
cd scripts
./cleanup-scripts.sh
```

### What Gets Removed
The cleanup script removes:
- One-time `check-*`, `fix-*`, `test-*` scripts
- Temporary `compare-*`, `validate-*`, `normalize-*` scripts
- Old debugging scripts no longer needed

---

## 🔐 Role System Overview

### System Roles (users table)
- **user** - Default role, regular access
- **admin/super_admin** - Can manage all users and access all projects

### Project Roles (project_members table)
- **viewer** - Read-only
- **editor** - Can edit docs
- **admin** - Can manage members
- **owner** - Full control

Super admins have god-mode access to all projects automatically!

---

## 📊 Before/After Cleanup

**Before:**
- 39+ script files
- Mixed purposes (debugging, testing, one-time fixes)
- Hard to find useful scripts

**After:**
- 8 organized scripts
- Clear separation: utils vs diagnostics
- Easy to navigate and maintain

---

**Last Updated:** February 2026
