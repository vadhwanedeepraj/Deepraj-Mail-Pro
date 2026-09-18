"use strict";

const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");
const { signToken } = require("../middleware/auth");
const logger = require("../utils/logger");

/**
 * Log in a user.
 *
 * Returns a JWT on success.
 * If the account requires a password reset (must_reset_password = true),
 * returns a short-lived token with mustResetPassword: true — the client
 * must call /api/auth/force-reset before accessing any other route.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    const { rows } = await pool.query(
      `SELECT id, tenant_id, email, password_hash, role, is_suspended, must_reset_password
         FROM users
        WHERE email = $1
        LIMIT 1`,
      [cleanEmail]
    );

    // Use identical error message for "not found" and "wrong password" to
    // prevent user-enumeration attacks.
    const INVALID_MSG = "Invalid email or password";

    if (rows.length === 0) {
      logger.warn("Login attempt for unknown email", { email: cleanEmail });
      return res.status(400).json({ success: false, message: INVALID_MSG });
    }

    const user = rows[0];

    // Guard: if password_hash is missing the account was never set up properly
    if (!user.password_hash) {
      logger.error("Account has no password_hash — created without hashing step", {
        email: cleanEmail,
        userId: user.id,
      });
      return res.status(500).json({
        success: false,
        message:
          "Account setup is incomplete. Please contact your Administrator.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      logger.warn("Login failed — wrong password", { email: cleanEmail });
      return res.status(400).json({ success: false, message: INVALID_MSG });
    }

    // Check suspension AFTER password verification to avoid leaking account existence
    if (user.is_suspended) {
      logger.warn("Login blocked — account suspended", { email: cleanEmail, userId: user.id });
      return res.status(403).json({
        success: false,
        message:
          "Your account has been suspended. Please contact the Administrator.",
      });
    }

    const payload = {
      id:                user.id,
      email:             user.email,
      role:              user.role,
      tenantId:          user.tenant_id,
      mustResetPassword: user.must_reset_password,
    };

    const token = signToken(payload);

    logger.info("User logged in successfully", {
      email:             cleanEmail,
      role:              user.role,
      mustResetPassword: user.must_reset_password,
    });

    return res.json({ success: true, token, ...payload });
  } catch (err) {
    next(err);
  }
}

/**
 * Force-update the user's password on first login.
 *
 * The request MUST carry the temporary JWT returned by /login
 * (Authorization: Bearer <token>). After a successful reset a
 * new, permanent token is issued.
 */
async function forceReset(req, res, next) {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    const { rows } = await pool.query(
      `UPDATE users
          SET password_hash       = $1,
              must_reset_password = FALSE
        WHERE email = $2
        RETURNING id, tenant_id, email, role`,
      [newHash, req.user.email]
    );

    if (rows.length === 0) {
      logger.error("force-reset called for non-existent user", {
        email: req.user.email,
      });
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = rows[0];

    const payload = {
      id:                user.id,
      email:             user.email,
      role:              user.role,
      tenantId:          user.tenant_id,
      mustResetPassword: false,
    };

    const token = signToken(payload);

    logger.info("User completed forced password reset", { email: user.email });

    return res.json({
      success: true,
      message: "Password updated successfully",
      token,
      ...payload,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, forceReset };
