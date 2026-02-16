#!/bin/bash

# Script to organize and clean up script files

cd "$(dirname "$0")"

echo "🧹 Cleaning up scripts directory..."

# Create organized structure
mkdir -p utils diagnostics

echo ""
echo "📁 Moving useful scripts to organized folders..."

# Move utility scripts (production-ready)
mv sync-knowledge-bases.ts utils/ 2>/dev/null || true
mv run-migration.ts utils/ 2>/dev/null || true

# Move user management scripts
mv make-admin.ts utils/ 2>/dev/null || true
mv set-user-password.ts utils/ 2>/dev/null || true

# Move useful diagnostic scripts
mv diagnose-navigation.ts diagnostics/ 2>/dev/null || true
mv check-title-badges.ts diagnostics/ 2>/dev/null || true
mv check-document-content.ts diagnostics/ 2>/dev/null || true
mv check-section-overviews.ts diagnostics/ 2>/dev/null || true

echo ""
echo "🗑️  Removing one-time debugging/test scripts..."

# Remove all check-* scripts (except the ones we moved)
rm -f check-*.ts

# Remove all fix-* scripts (one-time fixes)
rm -f fix-*.ts

# Remove all test-* scripts
rm -f test-*.ts

# Remove comparison and validation scripts
rm -f compare-*.ts
rm -f validate-*.ts
rm -f normalize-*.ts
rm -f verify-*.ts
rm -f update-*.ts

# Remove other temporary scripts
rm -f add-me-as-owner.ts
rm -f check-my-projects.ts
rm -f rebuild-navigation.ts
rm -f cleanup-project.ts

# Remove the archive folder if it's empty
rmdir archive 2>/dev/null || true

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "📊 Summary:"
echo "  Utils:       $(ls -1 utils/ 2>/dev/null | wc -l) files"
echo "  Diagnostics: $(ls -1 diagnostics/ 2>/dev/null | wc -l) files"
echo ""
echo "📁 Organized structure:"
echo "  scripts/"
echo "    ├── utils/           (production utilities)"
echo "    └── diagnostics/     (diagnostic tools)"
