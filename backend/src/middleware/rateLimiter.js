"use strict";

const rateLimit = require("express-rate-limit");

const isDev = process.env.NODE_ENV !== "production";

/**
 * Strict limiter for login — prevents brute-force attacks.
 * 10 attempts per 15 minutes per IP.
 */
const loginLimiter = rateLimit({
  windowMs:         15 * 60 * 1000, // 15 minutes
  max:              10,
  standardHeaders:  true,
  legacyHeaders:    false,
  skipSuccessfulRequests: true,      // Only count failures
  message: {
    success: false,
    message: "Too many login attempts. Please try again in 15 minutes.",
  },
  skip: () => isDev, // Skip in development
});

/**
 * Limiter for campaign dispatch — prevents spam.
 * 10 campaigns per hour per authenticated user.
 * Keyed by user email (from JWT) not just IP.
 */
const sendLimiter = rateLimit({
  windowMs:        60 * 60 * 1000, // 1 hour
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    (req) => req.user?.email || req.ip,
  message: {
    success: false,
    message: "Campaign dispatch limit reached. Maximum 10 campaigns per hour.",
  },
  skip: () => isDev,
});

/**
 * General API limiter — prevents DoS.
 * 200 requests per minute per IP.
 */
const apiLimiter = rateLimit({
  windowMs:        60 * 1000, // 1 minute
  max:             200,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success: false,
    message: "Too many requests. Please slow down.",
  },
  skip: () => isDev,
});

module.exports = { loginLimiter, sendLimiter, apiLimiter };
