"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");
const logger = require("../utils/logger");
const campaignRunner = require("../services/campaignRunner");

/**
 * Creates a new client account.
 */
async function createClient(req, res, next) {
  try {
    let { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email required" });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check if user already exists
    const { rows: existing } = await pool.query(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      [cleanEmail]
    );
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: "User already exists" });
    }

    const tempPassword = crypto.randomBytes(6).toString("hex");
    const hashedPassword = await bcrypt.hash(tempPassword, 12);
    const newTenantId = crypto.randomUUID();

    const { rows } = await pool.query(
      `INSERT INTO users (tenant_id, email, password_hash, role, must_reset_password, is_suspended, daily_quota)
       VALUES ($1, $2, $3, 'client', TRUE, FALSE, 200)
       RETURNING id, tenant_id, email`,
      [newTenantId, cleanEmail, hashedPassword]
    );

    const newUser = rows[0];

    logger.info("Admin created client account", { clientEmail: cleanEmail, tenantId: newTenantId });

    return res.json({
      success: true,
      message: "Client created successfully",
      tempPassword,
      tenantId: newTenantId,
      id: newUser.id
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Gets list of all clients (safe representation).
 */
async function getClients(req, res, next) {
  try {
    const { rows: clients } = await pool.query(
      `SELECT id, tenant_id, email, role, is_suspended, must_reset_password, daily_quota, sent_today, last_sent_date, created_at
       FROM users
       WHERE role = 'client'
       ORDER BY created_at DESC`
    );

    return res.json({
      success: true,
      clients
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Toggles a client's suspension status.
 */
async function updateClientStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { isSuspended } = req.body;

    const { rows } = await pool.query(
      `UPDATE users
       SET is_suspended = $1
       WHERE id = $2 AND role = 'client'
       RETURNING email, is_suspended`,
      [!!isSuspended, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Client not found" });
    }

    logger.info("Admin updated client status", { clientEmail: rows[0].email, isSuspended: rows[0].is_suspended });

    return res.json({
      success: true,
      message: "Client status updated successfully",
      isSuspended: rows[0].is_suspended
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Updates a client's daily quota.
 */
async function updateClientQuota(req, res, next) {
  try {
    const { id } = req.params;
    const { dailyQuota } = req.body;

    const limit = parseInt(dailyQuota, 10);
    if (isNaN(limit) || limit < 0) {
      return res.status(400).json({ success: false, message: "Invalid daily quota" });
    }

    const { rows } = await pool.query(
      `UPDATE users
       SET daily_quota = $1
       WHERE id = $2 AND role = 'client'
       RETURNING email, daily_quota`,
      [limit, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Client not found" });
    }

    logger.info("Admin updated client daily quota", { clientEmail: rows[0].email, dailyQuota: limit });

    return res.json({
      success: true,
      message: "Client daily quota updated successfully",
      dailyQuota: limit
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Resets client's password (overrides force reset).
 */
async function updateClientPassword(req, res, next) {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters long." });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const { rows } = await pool.query(
      `UPDATE users
       SET password_hash = $1, must_reset_password = FALSE
       WHERE id = $2 AND role = 'client'
       RETURNING email`,
      [hashedPassword, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Client not found" });
    }

    logger.info("Admin reset client password", { clientEmail: rows[0].email });

    return res.json({
      success: true,
      message: "Client password updated successfully"
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Deletes client account and wipes their data.
 */
async function deleteClient(req, res, next) {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    // Get the tenant ID and email first
    const { rows: userRows } = await client.query(
      "SELECT tenant_id, email FROM users WHERE id = $1 AND role = 'client'",
      [id]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: "Client not found" });
    }

    const { tenant_id, email } = userRows[0];

    await client.query("BEGIN");

    // Cascaded wipe of all tenant data
    await client.query("DELETE FROM tracking_events WHERE tenant_id = $1", [tenant_id]);
    await client.query("DELETE FROM campaign_results WHERE tenant_id = $1", [tenant_id]);
    await client.query("DELETE FROM campaigns WHERE tenant_id = $1", [tenant_id]);
    await client.query("DELETE FROM scheduled_jobs WHERE tenant_id = $1", [tenant_id]);
    await client.query("DELETE FROM unsubscribes WHERE tenant_id = $1", [tenant_id]);
    await client.query("DELETE FROM smtp_credentials WHERE tenant_id = $1", [tenant_id]);
    await client.query("DELETE FROM users WHERE id = $1", [id]);

    await client.query("COMMIT");

    logger.info("Admin deleted client account and cascade wiped tenant data", { clientEmail: email, tenantId: tenant_id });

    return res.json({
      success: true,
      message: "Client account deleted successfully"
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

/**
 * Fetches all active in-memory email campaigns.
 */
function getActiveCampaigns(req, res) {
  const campaigns = campaignRunner.getActiveCampaigns();
  return res.json({
    success: true,
    activeCampaigns: campaigns
  });
}

/**
 * Cancels a running email campaign.
 */
function cancelCampaign(req, res) {
  const { id } = req.params;
  campaignRunner.cancelCampaign(id);
  logger.warn("Admin requested cancellation of campaign", { campaignId: id });
  return res.json({
    success: true,
    message: "Cancellation request received"
  });
}

module.exports = {
  createClient,
  getClients,
  updateClientStatus,
  updateClientQuota,
  updateClientPassword,
  deleteClient,
  getActiveCampaigns,
  cancelCampaign
};
