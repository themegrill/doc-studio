-- Multi-Project Support Migration
-- This adds support for multiple projects using the same docs builder

-- 1. Create projects table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    domain VARCHAR(255), -- Optional custom domain
    settings JSONB DEFAULT '{}'::jsonb, -- Project-specific settings
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create project members table (many-to-many)
CREATE TABLE IF NOT EXISTS project_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'editor', 'member'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

-- 3. Add project_id to documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- 4. Add project_id to navigation table
ALTER TABLE navigation ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- 5. Update unique constraint on documents to be scoped per project
-- Drop old constraint and create new one
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS documents_project_slug_unique
    ON documents(project_id, slug);

-- 6. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_documents_project_id ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_navigation_project_id ON navigation(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);

-- 7. Add triggers for updated_at
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. Create a default project for existing data
INSERT INTO projects (name, slug, description)
VALUES (
    'Default Project',
    'default',
    'Default project for existing documents'
)
ON CONFLICT (slug) DO NOTHING
RETURNING id;

-- 9. Update existing documents and navigation to belong to default project
UPDATE documents
SET project_id = (SELECT id FROM projects WHERE slug = 'default')
WHERE project_id IS NULL;

UPDATE navigation
SET project_id = (SELECT id FROM projects WHERE slug = 'default')
WHERE project_id IS NULL;

-- 10. Make project_id NOT NULL now that all records have it
ALTER TABLE documents ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE navigation ALTER COLUMN project_id SET NOT NULL;

-- 11. Add test user to default project as owner
INSERT INTO project_members (project_id, user_id, role)
SELECT
    p.id,
    u.id,
    'owner'
FROM projects p, users u
WHERE p.slug = 'default'
  AND u.email = 'test@example.com'
ON CONFLICT (project_id, user_id) DO NOTHING;
