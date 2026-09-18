"use strict";

const jwt     = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/env");
const { pool } = require("../config/db");
const logger  = require("../utils/logger");

// ─── SUSPENSION STATUS CACHE ──────────────────────────────────────────────────
// Caches DB suspension check for 60s to avoid a DB query on every single request.
// A suspended user will be blocked within 60 seconds of the admin action.
const suspensionCache = new Map();
const SUSPENSION_CACHE_TTL_MS = 60 * 1000;

async function isSuspended(userId) {
  const cached = suspensionCache.get(userId);
  if (cached && Date.now() - cached.at < SUSPENSION_CACHE_TTL_MS) {
    return cached.suspended;
  }
  try {
    const { rows } = await pool.query(
      "SELECT is_suspended FROM users WHERE id = $1 LIMIT 1",
      [userId]
    );

    if (rows.length === 0) {
      // JWT references a user that no longer exists in the DB (deleted account).
      // Treat as suspended so the token is rejected.
      logger.warn("JWT references a deleted user account — blocking access", { userId });
      suspensionCache.set(userId, { suspended: true, at: Date.now() });
      return true;
    }

    const suspended = rows[0].is_suspended === true;
    suspensionCache.set(userId, { suspended, at: Date.now() });
    return suspended;
  } catch (_) {
    // On DB error, fail open (don't block user) — DB error handler will deal with it
    return false;
  }
}

/**
 * Verifies the JWT from the Authorization header.
 * Also checks real-time suspension status via a 60s-TTL DB cache.
 * Attaches the decoded payload to req.user.
 */
function authenticateToken(req, res, next) {
  const header = req.headers["authorization"];
  const token  = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  const requestId = req.requestId || req.headers["x-request-id"];

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      const isExpired = err.name === "TokenExpiredError";
      logger.warn("JWT verification failed", {
        requestId,
        reason: err.name,
        url:    req.originalUrl,
      });
      return res.status(403).json({
        success: false,
        message: isExpired
          ? "Session expired — please log in again"
          : "Invalid authentication token",
      });
    }

    // Real-time suspension check via a 60s-TTL DB cache.
    // Lets admins revoke access quickly without waiting for the JWT to expire.
    try {
      if (await isSuspended(decoded.id)) {
        // Invalidate cache so next request re-checks if the suspension was lifted
        suspensionCache.delete(decoded.id);
        logger.warn("Blocked request from suspended/deleted account", {
          requestId,
          userId: decoded.id,
          email:  decoded.email,
        });
        return res.status(403).json({
          success: false,
          message: "Your account has been suspended. Please contact the Administrator.",
        });
      }
    } catch (dbErr) {
      return next(dbErr);
    }

    req.user = decoded;
    next();
  });
}

/**
 * Requires the authenticated user to have the 'admin' role.
 * Must be used AFTER authenticateToken.
 */
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ success: false, message: "Administrator access required" });
  }
  next();
}

/**
 * Signs and returns a JWT for the given user payload.
 */
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

module.exports = { authenticateToken, requireAdmin, signToken };
