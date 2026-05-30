"use strict";

const { createError } = require("./errorHandler");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Throws a 400 ValidationError if condition is false */
function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = "ValidationError";
    err.statusCode = 400;
    throw err;
  }
}

/** Validates an email address format */
function isValidEmail(email) {
  return EMAIL_REGEX.test(String(email || "").trim());
}

/**
 * Middleware: validate login body
 */
function validateLogin(req, res, next) {
  try {
    const { email, password } = req.body;
    assert(email && typeof email === "string", "Email is required");
    assert(password && typeof password === "string", "Password is required");
    assert(isValidEmail(email), "Invalid email format");
    next();
  } catch (err) { next(err); }
}

/**
 * Middleware: validate password reset body
 */
function validatePasswordReset(req, res, next) {
  try {
    const { newPassword } = req.body;
    assert(newPassword && typeof newPassword === "string", "New password is required");
    assert(newPassword.length >= 8, "Password must be at least 8 characters");
    next();
  } catch (err) { next(err); }
}

/**
 * Middleware: validate create client body
 */
function validateCreateClient(req, res, next) {
  try {
    const { email } = req.body;
    assert(email && typeof email === "string", "Client email is required");
    assert(isValidEmail(email), "Invalid email format");
    next();
  } catch (err) { next(err); }
}

/**
 * Middleware: validate SMTP credentials body
 */
function validateSmtpCredentials(req, res, next) {
  try {
    const { smtpEmail, smtpPassword } = req.body;
    assert(smtpEmail && typeof smtpEmail === "string", "SMTP email is required");
    assert(isValidEmail(smtpEmail), "Invalid SMTP email format");
    assert(smtpPassword && typeof smtpPassword === "string", "SMTP password is required");
    assert(smtpPassword.length >= 8, "SMTP password must be at least 8 characters");
    next();
  } catch (err) { next(err); }
}

/**
 * Middleware: validate quota update body
 */
function validateQuota(req, res, next) {
  try {
    const { dailyQuota } = req.body;
    const limit = parseInt(dailyQuota, 10);
    assert(!isNaN(limit) && limit >= 0, "Daily quota must be a non-negative number");
    req.body.dailyQuota = limit;
    next();
  } catch (err) { next(err); }
}

/**
 * Middleware: validate password update body (admin reset)
 */
function validateAdminPasswordReset(req, res, next) {
  try {
    const { password } = req.body;
    assert(password && typeof password === "string", "Password is required");
    assert(password.length >= 8, "Password must be at least 8 characters");
    next();
  } catch (err) { next(err); }
}

module.exports = {
  isValidEmail,
  validateLogin,
  validatePasswordReset,
  validateCreateClient,
  validateSmtpCredentials,
  validateQuota,
  validateAdminPasswordReset,
};
