-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (for authentication - will be used with NextAuth later)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    image TEXT,
    email_verified TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    blocks JSONB DEFAULT '[]'::jsonb,
    published BOOLEAN DEFAULT false,
    order_index INTEGER DEFAULT 0,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Navigation table
CREATE TABLE IF NOT EXISTS navigation (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    structure JSONB NOT NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_documents_slug ON documents(slug);
CREATE INDEX IF NOT EXISTS idx_documents_published ON documents(published);
CREATE INDEX IF NOT EXISTS idx_documents_order ON documents(order_index);
CREATE INDEX IF NOT EXISTS idx_navigation_updated_at ON navigation(updated_at DESC);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers to auto-update updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_navigation_updated_at BEFORE UPDATE ON navigation
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert a default navigation structure
INSERT INTO navigation (structure) VALUES (
    '{"title": "Documentation", "version": "1.0", "routes": []}'::jsonb
);

-- Create a default user for development (optional)
INSERT INTO users (email, name) VALUES
    ('dev@example.com', 'Development User');
