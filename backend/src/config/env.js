"use strict";

// Load environment variables from local .env in development
if (process.env.NODE_ENV !== "production") {
  const path = require("path");
  require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
}

/**
 * Environment variable validation.
 *
 * Validates ALL required env vars at startup and throws with a clear
 * human-readable message if any are missing or insecure.
 * Fail-fast > silent failures.
 */

const required = [
  { key: "DATABASE_URL",   hint: "PostgreSQL connection string — e.g. postgresql://user:pass@host:5432/db" },
  { key: "JWT_SECRET",     hint: "Minimum 64-char random string — generate with: openssl rand -hex 32" },
  { key: "ENCRYPTION_KEY", hint: "Minimum 32-char string (NEVER change after first deploy!) — openssl rand -hex 16" },
  { key: "ADMIN_EMAIL",    hint: "Email address for the default admin account" },
  { key: "ADMIN_PASSWORD", hint: "Password for the default admin account (min 12 chars in production)" },
];

const optional = {
  NODE_ENV:             "development",
  PORT:                 "3001",
  LOG_LEVEL:            "info",
  BACKEND_URL:          "http://localhost:3001",
  CORS_ORIGINS:         "http://localhost:3000",
  REDIS_URL:            null,
  REDIS_HOST:           "127.0.0.1",
  REDIS_PORT:           "6379",
  VERCEL_PROXY_URL:     "https://email-proxy-one.vercel.app/api/send",
  BYPASS_PROXY_LOCALLY: "false",
  PROXY_SECRET:         null,
};

function validate() {
  // Allow missing vars in test environments
  if (process.env.NODE_ENV === "test") return;

  // ── 1. Check for missing required vars ──────────────────────────────────────
  const missing = required.filter(({ key }) => !process.env[key]);
  if (missing.length > 0) {
    const lines = missing.map(({ key, hint }) => `  • ${key}: ${hint}`).join("\n");
    throw new Error(
      `\n\n🚨 Missing required environment variables:\n${lines}\n\n` +
      `Set them in your .env file (local dev) or Render/platform dashboard (production).\n`
    );
  }

  // ── 2. JWT_SECRET must be at least 64 characters ───────────────────────────
  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret.length < 64) {
    throw new Error(
      `\n🚨 JWT_SECRET is too short (${jwtSecret.length} chars). ` +
      `Minimum 64 characters required for security.\n` +
      `Generate a secure secret with: openssl rand -hex 32\n`
    );
  }

  // ── 3. ENCRYPTION_KEY must be at least 32 characters ───────────────────────
  const encKey = process.env.ENCRYPTION_KEY;
  if (encKey.length < 32) {
    throw new Error(
      `\n🚨 ENCRYPTION_KEY must be at least 32 characters long.\n` +
      `Generate with: openssl rand -hex 16\n` +
      `⚠️  CRITICAL: Set ONCE and NEVER change after first deploy!\n`
    );
  }

  // ── 4. ADMIN_PASSWORD strength check (stricter in production) ──────────────
  const adminPass = process.env.ADMIN_PASSWORD;
  const isProduction = process.env.NODE_ENV === "production";
  const minPassLen = isProduction ? 12 : 8;
  if (adminPass.length < minPassLen) {
    throw new Error(
      `\n🚨 ADMIN_PASSWORD must be at least ${minPassLen} characters ` +
      `(${isProduction ? "production" : "development"} requirement).\n`
    );
  }

  // ── 5. Apply optional defaults ──────────────────────────────────────────────
  for (const [key, defaultValue] of Object.entries(optional)) {
    if (!process.env[key] && defaultValue !== null) {
      process.env[key] = defaultValue;
    }
  }
}

validate();

module.exports = {
  NODE_ENV:             process.env.NODE_ENV,
  IS_PRODUCTION:        process.env.NODE_ENV === "production",
  PORT:                 parseInt(process.env.PORT, 10),
  DATABASE_URL:         process.env.DATABASE_URL,
  JWT_SECRET:           process.env.JWT_SECRET,
  ENCRYPTION_KEY:       process.env.ENCRYPTION_KEY,
  ADMIN_EMAIL:          process.env.ADMIN_EMAIL?.toLowerCase().trim(),
  ADMIN_PASSWORD:       process.env.ADMIN_PASSWORD,
  BACKEND_URL:          process.env.BACKEND_URL?.replace(/\/+$/, ""),
  CORS_ORIGINS:         process.env.CORS_ORIGINS?.split(",").map((s) => s.trim()),
  LOG_LEVEL:            process.env.LOG_LEVEL,
  REDIS_URL:            process.env.REDIS_URL || null,
  REDIS_HOST:           process.env.REDIS_HOST,
  REDIS_PORT:           parseInt(process.env.REDIS_PORT, 10),
  PROXY_SECRET:         process.env.PROXY_SECRET || null,
  VERCEL_PROXY_URL:     process.env.VERCEL_PROXY_URL,
  BYPASS_PROXY_LOCALLY: process.env.BYPASS_PROXY_LOCALLY === "true",
};
