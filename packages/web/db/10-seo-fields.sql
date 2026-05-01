-- Add SEO metadata column to documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS seo JSONB DEFAULT '{}'::jsonb;

-- Index for potential future querying of seo fields
CREATE INDEX IF NOT EXISTS idx_documents_seo ON documents USING gin(seo);
