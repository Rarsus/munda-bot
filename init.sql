-- Create initial schema for Discord Bot

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    discord_id VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(255) NOT NULL,
    discriminator VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Guilds table
CREATE TABLE IF NOT EXISTS guilds (
    id BIGSERIAL PRIMARY KEY,
    discord_guild_id VARCHAR(255) NOT NULL UNIQUE,
    guild_name VARCHAR(255) NOT NULL,
    prefix VARCHAR(10) DEFAULT '!',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Guild members table
CREATE TABLE IF NOT EXISTS guild_members (
    id BIGSERIAL PRIMARY KEY,
    guild_id BIGINT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    discord_user_id VARCHAR(255) NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, discord_user_id)
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    guild_id BIGINT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
CREATE INDEX IF NOT EXISTS idx_guilds_discord_guild_id ON guilds(discord_guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_members_guild_id ON guild_members(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_members_user_id ON guild_members(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_guild_id ON audit_logs(guild_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- GDPR Compliance Tables

-- User personal data (GDPR Article 15 - Right to access)
CREATE TABLE IF NOT EXISTS gdpr_user_data (
    user_id VARCHAR(255) PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    discriminator VARCHAR(4),
    email VARCHAR(255),
    avatar_url TEXT,
    locale VARCHAR(10),
    bio TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP,
    UNIQUE(email)
);

CREATE INDEX IF NOT EXISTS idx_gdpr_user_id ON gdpr_user_data(user_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_user_deleted_at ON gdpr_user_data(deleted_at);

-- Guild member data (GDPR Article 15 - Right to access)
CREATE TABLE IF NOT EXISTS gdpr_guild_member_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    joined_at TIMESTAMP NOT NULL,
    roles JSONB DEFAULT '[]',
    nick VARCHAR(255),
    mute BOOLEAN DEFAULT FALSE,
    deaf BOOLEAN DEFAULT FALSE,
    pending BOOLEAN DEFAULT FALSE,
    timed_out_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP,
    UNIQUE(guild_id, user_id),
    FOREIGN KEY(user_id) REFERENCES gdpr_user_data(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gdpr_guild_member_guild_id ON gdpr_guild_member_data(guild_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_guild_member_user_id ON gdpr_guild_member_data(user_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_guild_member_guild_user ON gdpr_guild_member_data(guild_id, user_id);

-- Consent records (GDPR Article 7 - Consent management)
CREATE TABLE IF NOT EXISTS gdpr_consent (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    consent_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'given',
    given_at TIMESTAMP,
    withdrawn_at TIMESTAMP,
    expires_at TIMESTAMP,
    version INT DEFAULT 1,
    ip_hash VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, consent_type),
    FOREIGN KEY(user_id) REFERENCES gdpr_user_data(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gdpr_consent_user_id ON gdpr_consent(user_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_consent_type ON gdpr_consent(consent_type);
CREATE INDEX IF NOT EXISTS idx_gdpr_consent_status ON gdpr_consent(status);

-- Audit logs (GDPR Article 32 - Data processing records, 3-year retention)
CREATE TABLE IF NOT EXISTS gdpr_audit_log (
    id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    subject_user_id VARCHAR(255),
    requesting_user_id VARCHAR(255),
    resource_type VARCHAR(20) NOT NULL,
    resource_id VARCHAR(255) NOT NULL,
    guild_id VARCHAR(255),
    action TEXT,
    changes JSONB,
    ip_address_hash VARCHAR(255),
    user_agent_hash VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    retained_until TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '3 years'),
    archived BOOLEAN DEFAULT FALSE,
    CONSTRAINT no_premature_delete CHECK (NOW() < retained_until OR archived = true)
);

CREATE INDEX IF NOT EXISTS idx_gdpr_audit_subject_user ON gdpr_audit_log(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_audit_requesting_user ON gdpr_audit_log(requesting_user_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_audit_resource ON gdpr_audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_audit_guild ON gdpr_audit_log(guild_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_audit_event_type ON gdpr_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_gdpr_audit_created ON gdpr_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_gdpr_audit_retained ON gdpr_audit_log(retained_until);

-- Data Access Requests (GDPR Article 15 - Right to access, Article 20 - Portability)
CREATE TABLE IF NOT EXISTS gdpr_data_access_request (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    request_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    data_format VARCHAR(10) DEFAULT 'json',
    download_url TEXT,
    requested_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY(user_id) REFERENCES gdpr_user_data(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gdpr_data_access_request_user_id ON gdpr_data_access_request(user_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_data_access_request_status ON gdpr_data_access_request(status);
CREATE INDEX IF NOT EXISTS idx_gdpr_data_access_request_requested_at ON gdpr_data_access_request(requested_at);
CREATE INDEX IF NOT EXISTS idx_gdpr_data_access_request_expires_at ON gdpr_data_access_request(expires_at);

-- Erasure Requests (GDPR Article 17 - Right to be forgotten)
CREATE TABLE IF NOT EXISTS gdpr_erasure_request (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    reason TEXT,
    delete_user_data BOOLEAN DEFAULT TRUE,
    delete_guild_memberships BOOLEAN DEFAULT TRUE,
    delete_consents BOOLEAN DEFAULT TRUE,
    delete_audit_logs BOOLEAN DEFAULT FALSE,
    requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMP,
    approved_by VARCHAR(255),
    denied_at TIMESTAMP,
    denied_by VARCHAR(255),
    denied_reason TEXT,
    completed_at TIMESTAMP,
    restored_at TIMESTAMP,
    restored_by VARCHAR(255),
    restore_reason TEXT,
    expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days'),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY(user_id) REFERENCES gdpr_user_data(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gdpr_erasure_request_user_id ON gdpr_erasure_request(user_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_erasure_request_status ON gdpr_erasure_request(status);
CREATE INDEX IF NOT EXISTS idx_gdpr_erasure_request_expires_at ON gdpr_erasure_request(expires_at);
CREATE INDEX IF NOT EXISTS idx_gdpr_erasure_request_status ON gdpr_erasure_request(status);
CREATE INDEX IF NOT EXISTS idx_gdpr_erasure_request_requested_at ON gdpr_erasure_request(requested_at);