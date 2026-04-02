-- Multi-Project Support Migration
-- Adds support for multiple projects using the same docs builder

-- 1. Create projects table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    domain VARCHAR(255),
    settings JSONB DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create project members table
CREATE TABLE IF NOT EXISTS project_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (project_id, user_id)
);

-- 3. Add project_id to documents table
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- 4. Add project_id to navigation table
ALTER TABLE navigation
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- 5. Scope document slug uniqueness per project
ALTER TABLE documents
DROP CONSTRAINT IF EXISTS documents_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS documents_project_slug_unique
ON documents(project_id, slug);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_documents_project_id ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_navigation_project_id ON navigation(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);

-- 7. updated_at trigger for projects
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. Create a default project for existing data
INSERT INTO projects (name, slug, description)
VALUES (
    'Default Project',
    'default',
    'Default project for existing documents'
)
ON CONFLICT (slug) DO NOTHING;

-- 9. Move existing records to default project
UPDATE documents
SET project_id = (SELECT id FROM projects WHERE slug = 'default')
WHERE project_id IS NULL;

UPDATE navigation
SET project_id = (SELECT id FROM projects WHERE slug = 'default')
WHERE project_id IS NULL;

-- 10. Make project_id required after backfill
ALTER TABLE documents
ALTER COLUMN project_id SET NOT NULL;

ALTER TABLE navigation
ALTER COLUMN project_id SET NOT NULL;
