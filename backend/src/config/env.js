"use strict";

/**
 * Environment variable validation.
 * Validates ALL required env vars at startup and throws with a clear
 * human-readable message if any are missing. Fail-fast > silent failures.
 */

const required = [
  { key: "DATABASE_URL",   hint: "PostgreSQL connection string (from Render database)" },
  { key: "JWT_SECRET",     hint: "Random 64-char string — use: openssl rand -hex 32" },
  { key: "ENCRYPTION_KEY", hint: "32-byte hex string (64 chars) for AES-256-GCM — use: openssl rand -hex 32" },
  { key: "ADMIN_EMAIL",    hint: "Email address for the default admin account" },
  { key: "ADMIN_PASSWORD", hint: "Password for the default admin (min 8 chars)" },
];

const optional = {
  NODE_ENV:       "development",
  PORT:           "3001",
  LOG_LEVEL:      "info",
  BACKEND_URL:    "http://localhost:3001",
  CORS_ORIGINS:   "http://localhost:3000",
  REDIS_URL:      null,
  REDIS_HOST:     "127.0.0.1",
  REDIS_PORT:     "6379",
};

function validate() {
  // In test environments allow missing vars
  if (process.env.NODE_ENV === "test") return;

  const missing = required.filter(({ key }) => !process.env[key]);
  if (missing.length > 0) {
    const lines = missing.map(({ key, hint }) => `  • ${key}: ${hint}`).join("\n");
    throw new Error(
      `\n\n🚨 Missing required environment variables:\n${lines}\n\n` +
      `Set them in your .env file (local dev) or Render dashboard (production).\n`
    );
  }

  // Validate ENCRYPTION_KEY is exactly 64 hex chars (32 bytes for AES-256)
  const encKey = process.env.ENCRYPTION_KEY;
  if (!/^[0-9a-fA-F]{64}$/.test(encKey)) {
    throw new Error(
      `\n🚨 ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).\n` +
      `Generate one with: openssl rand -hex 32\n`
    );
  }

  // Apply optional defaults
  for (const [key, defaultValue] of Object.entries(optional)) {
    if (!process.env[key] && defaultValue !== null) {
      process.env[key] = defaultValue;
    }
  }
}

validate();

module.exports = {
  NODE_ENV:       process.env.NODE_ENV,
  PORT:           parseInt(process.env.PORT, 10),
  DATABASE_URL:   process.env.DATABASE_URL,
  JWT_SECRET:     process.env.JWT_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  ADMIN_EMAIL:    process.env.ADMIN_EMAIL?.toLowerCase().trim(),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  BACKEND_URL:    process.env.BACKEND_URL?.replace(/\/+$/, ""),
  CORS_ORIGINS:   process.env.CORS_ORIGINS?.split(",").map(s => s.trim()),
  LOG_LEVEL:      process.env.LOG_LEVEL,
  REDIS_URL:      process.env.REDIS_URL || null,
  REDIS_HOST:     process.env.REDIS_HOST,
  REDIS_PORT:     parseInt(process.env.REDIS_PORT, 10),
  IS_PRODUCTION:  process.env.NODE_ENV === "production",
};
