"use strict";

const fs   = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { pool }        = require("../config/db");
const { ADMIN_EMAIL, ADMIN_PASSWORD } = require("../config/env");
const logger = require("../utils/logger");

/**
 * Runs the schema SQL and seeds the default admin user.
 * Idempotent — safe to call on every server startup.
 */
async function runMigrations() {
  logger.info("Running database migrations...");

  const schemaPath = path.join(__dirname, "schema.sql");
  const schemaSql  = fs.readFileSync(schemaPath, "utf8");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(schemaSql);
    await client.query("COMMIT");
    logger.info("✅ Database schema applied successfully");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("🚨 Migration failed", { error: err.message });
    throw err;
  } finally {
    client.release();
  }

  await seedAdmin();
}

/**
 * Creates the default admin user if no admin exists.
 * Uses ADMIN_EMAIL and ADMIN_PASSWORD from environment variables.
 * Idempotent — won't overwrite if admin already exists.
 */
async function seedAdmin() {
  const { rows } = await pool.query(
    "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
  );

  if (rows.length > 0) {
    logger.info("Admin user already exists — skipping seed");
    return;
  }

  const adminId     = require("crypto").randomUUID();
  const tenantId    = adminId; // Admin's tenant IS their own ID
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  await pool.query(
    `INSERT INTO users
       (id, tenant_id, email, password_hash, role, must_reset_password, is_suspended)
     VALUES ($1, $2, $3, $4, 'admin', FALSE, FALSE)
     ON CONFLICT (email) DO NOTHING`,
    [adminId, tenantId, ADMIN_EMAIL, passwordHash]
  );

  logger.info("✅ Default admin user seeded", { email: ADMIN_EMAIL });
}

module.exports = { runMigrations };
