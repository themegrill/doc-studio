-- Add metadata column to projects table for flexible settings
ALTER TABLE projects ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Add index for JSON queries
CREATE INDEX IF NOT EXISTS idx_projects_metadata ON projects USING gin (metadata);

-- Add comment
COMMENT ON COLUMN projects.metadata IS 'Flexible metadata for project settings (logo, colors, etc.)';
