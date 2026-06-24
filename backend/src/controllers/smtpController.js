"use strict";

const { pool } = require("../config/db");
const { sendEmailWithBypass } = require("../services/emailService");
const { encrypt, decrypt } = require("../services/encryptionService");
const logger = require("../utils/logger");

/**
 * Saves or updates encrypted SMTP credentials for the logged-in user.
 * SECURITY: Clients CANNOT save SMTP credentials — only admin can persist them.
 * If credentials are locked by admin, clients cannot overwrite them either.
 */
async function save(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "SMTP email and password are required" });
    }

    const { id: userId, tenantId, role } = req.user;

    // Only admin can save SMTP credentials to database
    if (role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only administrators can save SMTP credentials. Please enter your credentials each session."
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Encrypt the password using AES-256-GCM
    const { encrypted, iv, authTag } = encrypt(password);

    await pool.query(
      `INSERT INTO smtp_credentials (user_id, tenant_id, smtp_email, encrypted_pass, iv, auth_tag, locked_by_admin)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       ON CONFLICT (user_id) DO UPDATE SET
         smtp_email = EXCLUDED.smtp_email,
         encrypted_pass = EXCLUDED.encrypted_pass,
         iv = EXCLUDED.iv,
         auth_tag = EXCLUDED.auth_tag,
         locked_by_admin = TRUE,
         updated_at = NOW()`,
      [userId, tenantId, cleanEmail, encrypted, iv, authTag]
    );

    logger.info("Admin SMTP credentials saved/updated successfully", { userId, tenantId, email: cleanEmail });

    return res.json({
      success: true,
      message: "SMTP credentials saved successfully"
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Checks if the user has saved SMTP credentials.
 * Returns lockedByAdmin flag so the frontend knows the lock state.
 */
async function status(req, res, next) {
  try {
    const { id: userId } = req.user;

    const { rows } = await pool.query(
      `SELECT smtp_email, locked_by_admin FROM smtp_credentials WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.json({ success: true, saved: false, lockedByAdmin: false });
    }

    return res.json({
      success: true,
      saved: true,
      email: rows[0].smtp_email,
      lockedByAdmin: rows[0].locked_by_admin === true
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Tests connection using the stored SMTP credentials.
 */
async function testStored(req, res, next) {
  try {
    const { id: userId, tenantId } = req.user;
    const { testTo, vercelProxyUrl } = req.body;

    const { rows } = await pool.query(
      `SELECT smtp_email, encrypted_pass, iv, auth_tag FROM smtp_credentials WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: "No saved SMTP credentials found." });
    }

    const { smtp_email, encrypted_pass, iv, auth_tag } = rows[0];
    const decryptedPassword = decrypt(encrypted_pass, iv, auth_tag);

    await performTest({
      email: smtp_email,
      password: decryptedPassword,
      testTo,
      vercelProxyUrl,
      res
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Tests connection directly using email and password passed in body (before saving).
 */
async function testDirect(req, res, next) {
  try {
    const { email, password, testTo, vercelProxyUrl } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "SMTP credentials required" });
    }

    await performTest({
      email,
      password,
      testTo,
      vercelProxyUrl,
      res
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Clears/Deletes stored SMTP credentials.
 * SECURITY: Clients cannot delete admin-locked credentials.
 */
async function deleteStored(req, res, next) {
  try {
    const { id: userId, role } = req.user;

    // Check if credentials are locked by admin
    if (role !== "admin") {
      const { rows: existing } = await pool.query(
        "SELECT locked_by_admin FROM smtp_credentials WHERE user_id = $1 LIMIT 1",
        [userId]
      );
      if (existing.length > 0 && existing[0].locked_by_admin) {
        return res.status(403).json({
          success: false,
          message: "SMTP credentials are locked by the administrator. Contact your admin to modify them."
        });
      }
    }

    await pool.query(
      "DELETE FROM smtp_credentials WHERE user_id = $1",
      [userId]
    );

    logger.info("SMTP credentials cleared by user", { userId });

    return res.json({
      success: true,
      message: "Credentials cleared successfully"
    });
  } catch (err) {
    next(err);
  }
}

// ─── ADMIN-ONLY: Manage SMTP for Client Accounts ──────────────────────────────

/**
 * Admin saves SMTP credentials for a specific client.
 * Sets locked_by_admin = TRUE so the client can't modify them.
 */
async function adminSaveSmtp(req, res, next) {
  try {
    const { clientId } = req.params;
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "SMTP email and password are required" });
    }

    // Look up the client user
    const { rows: userRows } = await pool.query(
      "SELECT id, tenant_id, email AS user_email FROM users WHERE id = $1 AND role = 'client'",
      [clientId]
    );
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: "Client not found" });
    }

    const client = userRows[0];
    const cleanEmail = email.toLowerCase().trim();
    const { encrypted, iv, authTag } = encrypt(password);

    await pool.query(
      `INSERT INTO smtp_credentials (user_id, tenant_id, smtp_email, encrypted_pass, iv, auth_tag, locked_by_admin)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       ON CONFLICT (user_id) DO UPDATE SET
         smtp_email = EXCLUDED.smtp_email,
         encrypted_pass = EXCLUDED.encrypted_pass,
         iv = EXCLUDED.iv,
         auth_tag = EXCLUDED.auth_tag,
         locked_by_admin = TRUE,
         updated_at = NOW()`,
      [client.id, client.tenant_id, cleanEmail, encrypted, iv, authTag]
    );

    logger.info("Admin locked SMTP credentials for client", {
      adminId: req.user.id,
      clientId: client.id,
      clientEmail: client.user_email,
      smtpEmail: cleanEmail
    });

    return res.json({
      success: true,
      message: `SMTP credentials locked for ${client.user_email}`
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin clears/unlocks SMTP credentials for a specific client.
 */
async function adminDeleteSmtp(req, res, next) {
  try {
    const { clientId } = req.params;

    const { rows: userRows } = await pool.query(
      "SELECT id, email FROM users WHERE id = $1 AND role = 'client'",
      [clientId]
    );
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: "Client not found" });
    }

    await pool.query(
      "DELETE FROM smtp_credentials WHERE user_id = $1",
      [clientId]
    );

    logger.info("Admin cleared SMTP credentials for client", {
      adminId: req.user.id,
      clientId,
      clientEmail: userRows[0].email
    });

    return res.json({
      success: true,
      message: `SMTP credentials cleared for ${userRows[0].email}`
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin checks SMTP status for a specific client.
 */
async function adminGetSmtpStatus(req, res, next) {
  try {
    const { clientId } = req.params;

    const { rows } = await pool.query(
      `SELECT smtp_email, locked_by_admin FROM smtp_credentials WHERE user_id = $1 LIMIT 1`,
      [clientId]
    );

    if (rows.length === 0) {
      return res.json({ success: true, saved: false, lockedByAdmin: false });
    }

    return res.json({
      success: true,
      saved: true,
      email: rows[0].smtp_email,
      lockedByAdmin: rows[0].locked_by_admin === true
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Shared helper to send a test verification email.
 */
async function performTest({ email, password, testTo, vercelProxyUrl, res }) {
  const VERCEL_PROXY_URL = vercelProxyUrl || "https://email-proxy-one.vercel.app/api/send";
  
  if (!testTo) {
    // Only verify SMTP credentials without sending an email
    await sendEmailWithBypass({
      vercelProxyUrl: VERCEL_PROXY_URL,
      email,
      password,
      verifyOnly: true
    });
  } else {
    // Send actual test email to the specified recipient
    await sendEmailWithBypass({
      vercelProxyUrl: VERCEL_PROXY_URL,
      email,
      password,
      to: testTo,
      subject: "✅ Deepraj Mail Pro — SMTP Test",
      html: `<div style="font-family:sans-serif;padding:24px;background:#f9fafb;border-radius:12px;max-width:480px">
        <h2 style="color:#2563eb;margin-top:0">Connection Successful!</h2>
        <p style="color:#374151">Your Render Server successfully bypassed the firewall via Vercel.</p>
        <p style="color:#6b7280;font-size:12px">Sent at ${new Date().toUTCString()}</p>
      </div>`
    });
  }

  return res.json({
    success: true,
    message: testTo ? `Test email sent to ${testTo}` : "Connection verified!"
  });
}

module.exports = {
  save,
  status,
  testStored,
  testDirect,
  deleteStored,
  adminSaveSmtp,
  adminDeleteSmtp,
  adminGetSmtpStatus
};
