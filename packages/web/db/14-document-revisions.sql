-- Current content stays in documents. Drafts and immutable history live separately.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_version BIGINT NOT NULL DEFAULT 1;

-- Always own the token in the database so legacy/structural writers invalidate
-- stale revision bases too. Timestamp/actor-only updates do not change it.
-- Publication explicitly requests OLD + 1, including identical-content releases.
-- Other supplied token values cannot skip or rewind the sequence.
CREATE OR REPLACE FUNCTION bump_document_content_version()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.content_version = OLD.content_version + 1 OR
       ROW(NEW.title, NEW.description, NEW.blocks, NEW.seo, NEW.slug,
           NEW.published, NEW.deleted_at, NEW.project_id, NEW.order_index)
       IS DISTINCT FROM
       ROW(OLD.title, OLD.description, OLD.blocks, OLD.seo, OLD.slug,
           OLD.published, OLD.deleted_at, OLD.project_id, OLD.order_index) THEN
        NEW.content_version := OLD.content_version + 1;
    ELSE
        NEW.content_version := OLD.content_version;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bump_documents_content_version ON documents;
CREATE TRIGGER bump_documents_content_version
BEFORE UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION bump_document_content_version();

CREATE TABLE IF NOT EXISTS document_revisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    revision_number BIGINT NOT NULL CHECK (revision_number > 0),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
    seo JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'ready', 'released', 'historical', 'discarded')),
    product_version VARCHAR(200),
    release_note TEXT,
    source_revision_id UUID,
    base_document_version BIGINT NOT NULL CHECK (base_document_version > 0),
    edit_version BIGINT NOT NULL DEFAULT 1 CHECK (edit_version > 0),
    applied_document_version BIGINT CHECK (applied_document_version > 0),
    was_published BOOLEAN NOT NULL DEFAULT false,
    captured_slug VARCHAR(255) NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    released_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    released_at TIMESTAMP WITH TIME ZONE,
    superseded_at TIMESTAMP WITH TIME ZONE,
    captured_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (document_id, revision_number),
    UNIQUE (document_id, id),
    -- A history fork cannot point at another document's private content.
    FOREIGN KEY (document_id, source_revision_id)
        REFERENCES document_revisions(document_id, id),
    CHECK (source_revision_id IS NULL OR source_revision_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_document_revisions_history
    ON document_revisions(document_id, revision_number DESC);
CREATE INDEX IF NOT EXISTS idx_document_revisions_active
    ON document_revisions(document_id, updated_at DESC)
    WHERE status IN ('draft', 'ready');
CREATE INDEX IF NOT EXISTS idx_document_revisions_applied_version
    ON document_revisions(document_id, applied_document_version)
    WHERE applied_document_version IS NOT NULL;

-- No eager baseline: the first history-changing transaction captures current
-- content, without inventing a historical release date or product label.
