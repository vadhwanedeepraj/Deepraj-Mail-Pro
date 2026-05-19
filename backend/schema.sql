-- Enable the uuid extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tenants Table
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'client', -- 'admin' or 'client'
    must_reset_password BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Campaigns Table
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    subject VARCHAR(255) NOT NULL,
    total_recipients INTEGER DEFAULT 0,
    sent INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tracking Table (Partitioning candidate for production)
CREATE TABLE IF NOT EXISTS tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
    email VARCHAR(255) NOT NULL,
    event VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    user_agent TEXT,
    ip VARCHAR(45)
);

-- Unsubscribes Table
CREATE TABLE IF NOT EXISTS unsubscribes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, email)
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE unsubscribes ENABLE ROW LEVEL SECURITY;

-- 1. Admin Policy: If current_role is 'admin', they can see everything.
-- 2. Tenant Policy: If current_role is 'client', they can only see rows matching their tenant_id.

-- Users
CREATE POLICY users_isolation_policy ON users
    USING (
        current_setting('app.current_role', true) = 'admin' OR 
        tenant_id = current_setting('app.current_tenant_id', true)::UUID
    );

-- Campaigns
CREATE POLICY campaigns_isolation_policy ON campaigns
    USING (
        current_setting('app.current_role', true) = 'admin' OR 
        tenant_id = current_setting('app.current_tenant_id', true)::UUID
    );

-- Tracking
CREATE POLICY tracking_isolation_policy ON tracking
    USING (
        current_setting('app.current_role', true) = 'admin' OR 
        tenant_id = current_setting('app.current_tenant_id', true)::UUID
    );

-- Unsubscribes
CREATE POLICY unsubscribes_isolation_policy ON unsubscribes
    USING (
        current_setting('app.current_role', true) = 'admin' OR 
        tenant_id = current_setting('app.current_tenant_id', true)::UUID
    );

-- Insert Default Admin Tenant and User
INSERT INTO tenants (name) VALUES ('System Administration') ON CONFLICT DO NOTHING;

-- Note: You will need to extract the inserted tenant ID and insert the admin user manually during setup.
-- INSERT INTO users (tenant_id, email, password_hash, role, must_reset_password) 
-- VALUES ((SELECT id FROM tenants LIMIT 1), 'admin@example.com', 'HASH_HERE', 'admin', false);
