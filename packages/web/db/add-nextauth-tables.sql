-- NextAuth.js v5 Database Schema for PostgreSQL
-- Reference: https://authjs.dev/getting-started/adapters/postgresql

-- Accounts table (for OAuth providers and credentials)
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(255) NOT NULL,
    provider VARCHAR(255) NOT NULL,
    provider_account_id VARCHAR(255) NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at BIGINT,
    token_type VARCHAR(255),
    scope TEXT,
    id_token TEXT,
    session_state VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(provider, provider_account_id)
);

-- Sessions table (for session management)
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_token VARCHAR(255) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Verification tokens table (for email verification, password reset, etc.)
CREATE TABLE IF NOT EXISTS verification_tokens (
    identifier VARCHAR(255) NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (identifier, token)
);

-- Add password field to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255);

-- Add hashed_password for better naming convention
ALTER TABLE users ADD COLUMN IF NOT EXISTS hashed_password VARCHAR(255);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_session_token ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_token ON verification_tokens(token);

-- Add triggers for updated_at
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert a test user with password "password123" (hashed with bcrypt)
-- This is for development only - remove in production
INSERT INTO users (email, name, hashed_password)
VALUES (
    'test@example.com',
    'Test User',
    '$2a$10$rXKqUJNqQZWqPqCf.xL0KuN3Z6uZHzVKFYPGPKGNmJLPnQVVZV3/a'
)
ON CONFLICT (email) DO UPDATE SET
    hashed_password = EXCLUDED.hashed_password,
    name = EXCLUDED.name;
