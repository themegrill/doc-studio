-- Add role column to users table
-- Global system role, different from project-specific roles

ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'user';

-- Update existing users to have a default role
UPDATE users SET role = 'user' WHERE role IS NULL;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Add a comment explaining the role values
COMMENT ON COLUMN users.role IS 'Global system role: super_admin, admin, or user';
