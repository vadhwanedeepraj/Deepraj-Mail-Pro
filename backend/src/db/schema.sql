-- ============================================================
-- Deepraj Mail Pro — Production PostgreSQL Schema
-- Idempotent: safe to run on every startup (CREATE IF NOT EXISTS)
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID        NOT NULL,
    email               VARCHAR(320) UNIQUE NOT NULL,
    password_hash       TEXT        NOT NULL,
    role                VARCHAR(20) NOT NULL DEFAULT 'client'
                        CHECK (role IN ('admin', 'client')),
    is_suspended        BOOLEAN     NOT NULL DEFAULT FALSE,
    must_reset_password BOOLEAN     NOT NULL DEFAULT TRUE,
    daily_quota         INTEGER     NOT NULL DEFAULT 200 CHECK (daily_quota >= 0),
    sent_today          INTEGER     NOT NULL DEFAULT 0   CHECK (sent_today >= 0),
    last_sent_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);

-- ============================================================
-- SMTP CREDENTIALS (AES-256-GCM encrypted)
-- One record per user. Replace-on-save semantics.
-- ============================================================
CREATE TABLE IF NOT EXISTS smtp_credentials (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id        UUID        NOT NULL,
    smtp_email       VARCHAR(320) NOT NULL,
    encrypted_pass   TEXT        NOT NULL,   -- hex-encoded ciphertext
    iv               TEXT        NOT NULL,   -- 12-byte IV (hex)
    auth_tag         TEXT        NOT NULL,   -- 16-byte GCM auth tag (hex)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_smtp_user_id    ON smtp_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_smtp_tenant_id  ON smtp_credentials(tenant_id);

-- ============================================================
-- CAMPAIGNS
-- ============================================================
CREATE TABLE IF NOT EXISTS campaigns (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        UUID        NOT NULL,
    subject          TEXT        NOT NULL,
    total_recipients INTEGER     NOT NULL DEFAULT 0,
    sent             INTEGER     NOT NULL DEFAULT 0,
    failed           INTEGER     NOT NULL DEFAULT 0,
    status           VARCHAR(20) NOT NULL DEFAULT 'completed'
                     CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_id  ON campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at DESC);

-- ============================================================
-- CAMPAIGN RESULTS (individual recipient audit log)
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_results (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id   UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    tenant_id     UUID        NOT NULL,
    to_email      VARCHAR(320) NOT NULL,
    status        VARCHAR(20) NOT NULL CHECK (status IN ('sent', 'error', 'invalid', 'cancelled')),
    attach_status VARCHAR(20),
    reason        TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_results_campaign_id ON campaign_results(campaign_id);
CREATE INDEX IF NOT EXISTS idx_results_tenant_id   ON campaign_results(tenant_id);

-- ============================================================
-- EMAIL TRACKING (open pixel events)
-- ============================================================
CREATE TABLE IF NOT EXISTS tracking_events (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID        NOT NULL,
    campaign_id UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    email       VARCHAR(320) NOT NULL,
    event       VARCHAR(20) NOT NULL DEFAULT 'open',
    user_agent  TEXT,
    ip          VARCHAR(45),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tracking_unique_open
    ON tracking_events(campaign_id, email, event);
CREATE INDEX IF NOT EXISTS idx_tracking_campaign_id ON tracking_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_tracking_tenant_id   ON tracking_events(tenant_id);

-- ============================================================
-- UNSUBSCRIBES
-- ============================================================
CREATE TABLE IF NOT EXISTS unsubscribes (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID        NOT NULL,
    email       VARCHAR(320) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_unsub_tenant_email ON unsubscribes(tenant_id, email);

-- ============================================================
-- SCHEDULED JOBS
-- ============================================================
CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id     UUID        NOT NULL,
    schedule_time TIMESTAMPTZ NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    payload       JSONB       NOT NULL,
    started_at    TIMESTAMPTZ,
    error         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_status ON scheduled_jobs(status, schedule_time);
CREATE INDEX IF NOT EXISTS idx_scheduled_tenant  ON scheduled_jobs(tenant_id);
