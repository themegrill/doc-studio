-- Project Knowledge Bases Table
-- Stores knowledge base content linked to a project, differentiated by type.
-- type = 'upload'   → uploaded during project creation
-- type = 'website'  → crawled from a website URL
-- type = 'codebase' → fetched from a GitHub repository

CREATE TABLE IF NOT EXISTS project_knowledge_bases (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type        VARCHAR(20) NOT NULL CHECK (type IN ('upload', 'website', 'codebase')),
    content     JSONB NOT NULL,
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Only one KB entry per type per project
    UNIQUE (project_id, type)
);

CREATE INDEX IF NOT EXISTS idx_pkb_project_id ON project_knowledge_bases(project_id);
CREATE INDEX IF NOT EXISTS idx_pkb_project_type ON project_knowledge_bases(project_id, type);

DROP TRIGGER IF EXISTS update_project_knowledge_bases_updated_at ON project_knowledge_bases;
CREATE TRIGGER update_project_knowledge_bases_updated_at
    BEFORE UPDATE ON project_knowledge_bases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
