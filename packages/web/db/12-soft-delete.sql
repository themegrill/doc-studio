-- Soft delete / trash support for documents.
-- Trashed documents keep their row (and navigation entry) so they can be
-- restored; deleted_at IS NULL means "live", deleted_at IS NOT NULL means
-- "in trash". Permanent deletion removes the row entirely.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Speeds up the "live docs" filter used across read queries and the trash listing.
CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents(deleted_at);
