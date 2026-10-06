-- Repair documents trashed before trashing also cleared publication status.
-- Restored documents remain drafts until an editor explicitly publishes them.
UPDATE documents
SET published = false
WHERE deleted_at IS NOT NULL AND published = true;
