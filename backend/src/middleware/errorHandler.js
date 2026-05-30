"use strict";

const logger = require("../utils/logger");

/**
 * Centralized Express error handler.
 * Must be registered LAST with app.use() — after all routes.
 *
 * Returns consistent { success: false, message, code } JSON shape.
 * Never exposes stack traces in production.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;
  const isProduction = process.env.NODE_ENV === "production";

  // Log every error with full context
  logger.error("Unhandled error", {
    message:    err.message,
    statusCode,
    method:     req.method,
    url:        req.originalUrl,
    user:       req.user?.email,
    tenantId:   req.user?.tenantId,
    stack:      isProduction ? undefined : err.stack,
  });

  // Map known PostgreSQL error codes to friendly messages
  const pgErrorMap = {
    "23505": { status: 409, message: "A record with this value already exists" },
    "23503": { status: 400, message: "Referenced record does not exist" },
    "23514": { status: 400, message: "Value violates a database constraint" },
    "42P01": { status: 500, message: "Database table not found — migration may be needed" },
  };

  if (err.code && pgErrorMap[err.code]) {
    const mapped = pgErrorMap[err.code];
    return res.status(mapped.status).json({
      success: false,
      message: mapped.message,
      code:    err.code,
    });
  }

  // Validation errors (from validate middleware)
  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: err.message,
      code:    "VALIDATION_ERROR",
    });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return res.status(403).json({
      success: false,
      message: "Invalid or expired session",
      code:    "AUTH_ERROR",
    });
  }

  // Default server error
  res.status(statusCode).json({
    success: false,
    message: isProduction ? "An unexpected error occurred" : err.message,
    code:    "INTERNAL_ERROR",
    ...(isProduction ? {} : { stack: err.stack }),
  });
}

/**
 * Creates an HttpError with a status code attached.
 * Usage: throw createError(404, "User not found")
 */
function createError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

module.exports = { errorHandler, createError };
