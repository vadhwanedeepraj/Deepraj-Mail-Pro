"use strict";

const jwt    = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/env");

/**
 * Verifies the JWT from the Authorization header.
 * Attaches the decoded payload to req.user.
 */
function authenticateToken(req, res, next) {
  const header = req.headers["authorization"];
  const token  = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      const message = err.name === "TokenExpiredError"
        ? "Session expired — please log in again"
        : "Invalid authentication token";
      return res.status(403).json({ success: false, message });
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
