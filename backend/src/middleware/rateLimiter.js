"use strict";

const rateLimit = require("express-rate-limit");

const isProduction = process.env.NODE_ENV === "production";

/**
 * Strict limiter for the login endpoint — prevents brute-force attacks.
 *
 * Production : 10 failed attempts per 15 minutes per IP.
 * Development: 200 attempts per 15 minutes (still active so behaviour is
 *              tested locally; just generous enough not to block devs).
 *
 * skipSuccessfulRequests: true means successful logins don't count toward
 * the limit, so legitimate users are never blocked.
 */
const loginLimiter = rateLimit({
  windowMs:              15 * 60 * 1000,
  max:                   isProduction ? 10 : 200,
  standardHeaders:       true,
  legacyHeaders:         false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: "Too many login attempts. Please try again in 15 minutes.",
  },
});

/**
 * Limiter for campaign dispatch — prevents spam.
 * 10 campaigns per hour, keyed by authenticated user email (not just IP).
 *
 * Production : 10 campaigns/hour.
 * Development: 500 campaigns/hour (effectively unlimited for testing).
 */
const sendLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             isProduction ? 10 : 500,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    (req) => req.user?.email || req.ip,
  message: {
    success: false,
    message: "Campaign dispatch limit reached. Maximum 10 campaigns per hour.",
  },
});

/**
 * General API limiter — prevents DoS.
 * 200 requests per minute per IP in production.
 * 2000 requests per minute in development.
 */
const apiLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             isProduction ? 200 : 2000,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success: false,
    message: "Too many requests. Please slow down.",
  },
});

module.exports = { loginLimiter, sendLimiter, apiLimiter };
