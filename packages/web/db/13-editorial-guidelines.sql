-- Editorial guidelines support (DOCSTUDIO-45).
--
-- The guideline requires every meta title and description to be unique. That is
-- the one editorial rule a writer cannot check by hand, because it needs a
-- lookup across every other article — see lib/editorial/duplicates.ts.
--
-- Partial expression indexes: only live documents that actually have the field
-- set are ever queried, so excluding NULLs and trashed rows keeps these small.
CREATE INDEX IF NOT EXISTS idx_documents_seo_meta_title
    ON documents ((seo->>'metaTitle'))
    WHERE deleted_at IS NULL AND seo->>'metaTitle' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_seo_meta_description
    ON documents ((seo->>'metaDescription'))
    WHERE deleted_at IS NULL AND seo->>'metaDescription' IS NOT NULL;

-- No settings row is seeded here on purpose. The defaults live in exactly one
-- place — DEFAULT_GUIDELINES in lib/editorial/guidelines.ts — and
-- getGlobalGuidelines() falls back to them when no row exists. Seeding the
-- values here would recreate the "same rule written down in two places that
-- disagree" problem this ticket exists to remove. The row is written the first
-- time an admin saves the Documentation Guidelines settings screen.
