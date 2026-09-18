"use strict";

const fs     = require("fs");
const path   = require("path");
const bcrypt = require("bcryptjs");
const { pool }                        = require("../config/db");
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
 * Creates or updates the default admin user.
 *
 * Behaviour:
 *  - If NO admin exists  → insert a new one using ADMIN_EMAIL + ADMIN_PASSWORD.
 *  - If an admin EXISTS  → ensure its email matches ADMIN_EMAIL and update the
 *    password_hash so that changing .env credentials takes effect without
 *    requiring a manual DB wipe.
 *
 * Uses ON CONFLICT ... DO UPDATE so the operation is always atomic and
 * safe to run multiple times.
 */
async function seedAdmin() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    logger.warn("ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin seed");
    return;
  }

  // Hash the current .env password on every startup (fast; cost=12 is ~300ms)
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  // Check whether an admin row already exists
  const { rows } = await pool.query(
    "SELECT id, email FROM users WHERE role = 'admin' LIMIT 1"
  );

  if (rows.length > 0) {
    const existing = rows[0];

    // Update email + password so .env changes are always reflected
    await pool.query(
      `UPDATE users
         SET email          = $1,
             password_hash  = $2,
             daily_quota    = 10000,
             must_reset_password = FALSE
       WHERE id = $3`,
      [ADMIN_EMAIL, passwordHash, existing.id]
    );

    if (existing.email !== ADMIN_EMAIL) {
      logger.warn("Admin email updated from .env", {
        old: existing.email,
        new: ADMIN_EMAIL,
      });
    }

    logger.info("✅ Admin account verified and synced with .env", {
      email: ADMIN_EMAIL,
    });
    return;
  }

  // No admin yet — create one
  const adminId  = require("crypto").randomUUID();
  const tenantId = adminId; // Admin's tenant IS their own ID

  await pool.query(
    `INSERT INTO users
       (id, tenant_id, email, password_hash, role, must_reset_password, is_suspended, daily_quota)
     VALUES ($1, $2, $3, $4, 'admin', FALSE, FALSE, 10000)
     ON CONFLICT (email) DO UPDATE
       SET password_hash       = EXCLUDED.password_hash,
           must_reset_password = FALSE,
           daily_quota         = 10000`,
    [adminId, tenantId, ADMIN_EMAIL, passwordHash]
  );

  logger.info("✅ Default admin user seeded", {
    email:      ADMIN_EMAIL,
    dailyQuota: 10000,
  });
}

module.exports = { runMigrations };
