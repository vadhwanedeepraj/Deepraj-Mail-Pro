"use strict";

const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");
const { signToken } = require("../middleware/auth");

/**
 * Log in a user.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const cleanEmail = email.toLowerCase().trim();

    const { rows } = await pool.query(
      `SELECT id, tenant_id, email, password_hash, role, is_suspended, must_reset_password
       FROM users
       WHERE email = $1 LIMIT 1`,
      [cleanEmail]
    );

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: "Invalid email or password" });
    }

    const user = rows[0];

    // Check if password matches
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Invalid email or password" });
    }

    // Check suspension status
    if (user.is_suspended) {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended. Please contact the Administrator."
      });
    }

    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id,
      mustResetPassword: user.must_reset_password
    };

    const token = signToken(payload);

    return res.json({
      success: true,
      token,
      ...payload
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Force update the user's password on first login.
 */
async function forceReset(req, res, next) {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters long" });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    
    // Update user password and clear forced reset flag
    const { rows } = await pool.query(
      `UPDATE users
       SET password_hash = $1, must_reset_password = FALSE
       WHERE email = $2
       RETURNING id, tenant_id, email, role`,
      [newHash, req.user.email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = rows[0];

    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id,
      mustResetPassword: false
    };

    const token = signToken(payload);

    return res.json({
      success: true,
      message: "Password updated successfully",
      token,
      ...payload
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login,
  forceReset
};
