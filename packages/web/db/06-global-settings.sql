-- Global Settings Table
-- Stores server-wide key/value configuration (e.g. Vercel project IDs per slug).

CREATE TABLE IF NOT EXISTS global_settings (
    key         VARCHAR(255) PRIMARY KEY,
    value       JSONB        NOT NULL DEFAULT '{}'::jsonb,
    category    VARCHAR(100),
    description TEXT,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_global_settings_category ON global_settings(category);
