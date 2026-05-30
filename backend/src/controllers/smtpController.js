"use strict";

const { pool } = require("../config/db");
const { sendEmailWithBypass } = require("../services/emailService");
const { encrypt, decrypt } = require("../services/encryptionService");
const logger = require("../utils/logger");

/**
 * Saves or updates encrypted SMTP credentials for the logged-in user.
 */
async function save(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "SMTP email and password are required" });
    }

    const { id: userId, tenantId } = req.user;
    const cleanEmail = email.toLowerCase().trim();

    // Encrypt the password using AES-256-GCM
    const { encrypted, iv, authTag } = encrypt(password);

    await pool.query(
      `INSERT INTO smtp_credentials (user_id, tenant_id, smtp_email, encrypted_pass, iv, auth_tag)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         smtp_email = EXCLUDED.smtp_email,
         encrypted_pass = EXCLUDED.encrypted_pass,
         iv = EXCLUDED.iv,
         auth_tag = EXCLUDED.auth_tag,
         updated_at = NOW()`,
      [userId, tenantId, cleanEmail, encrypted, iv, authTag]
    );

    logger.info("SMTP credentials saved/updated successfully", { userId, tenantId, email: cleanEmail });

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
 */
async function status(req, res, next) {
  try {
    const { id: userId } = req.user;

    const { rows } = await pool.query(
      `SELECT smtp_email FROM smtp_credentials WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.json({ success: true, saved: false });
    }

    return res.json({
      success: true,
      saved: true,
      email: rows[0].smtp_email
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
 */
async function deleteStored(req, res, next) {
  try {
    const { id: userId } = req.user;

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

/**
 * Shared helper to send a test verification email.
 */
async function performTest({ email, password, testTo, vercelProxyUrl, res }) {
  const VERCEL_PROXY_URL = vercelProxyUrl || "https://email-proxy-one.vercel.app/api/send";
  
  await sendEmailWithBypass({
    vercelProxyUrl: VERCEL_PROXY_URL,
    email,
    password,
    verifyOnly: !testTo
  });

  if (testTo) {
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
  deleteStored
};
