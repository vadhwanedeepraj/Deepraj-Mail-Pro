const winston = require("winston");
const path    = require("path");
const fs      = require("fs");

const isProduction = process.env.NODE_ENV === "production";

// ── Development Format ────────────────────────────────────────────────────────
// Human-readable, colourised output for local development.
const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, requestId, stack, ...meta }) => {
    const rid       = requestId ? ` [${requestId.slice(0, 8)}]` : "";
    const metaStr   = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : "";
    const stackStr  = stack ? `\n${stack}` : "";
    return `[${timestamp}]${rid} ${level}: ${message}${metaStr}${stackStr}`;
  })
);

// ── Production Format ─────────────────────────────────────────────────────────
// Structured JSON — parseable by Render Logs, Datadog, Grafana Loki, ELK, etc.
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// ── Transports ────────────────────────────────────────────────────────────────
// Always write to console. Render/Docker aggregates stdout automatically.
// File transports only in development — managed container filesystems may be
// read-only or ephemeral in production.
const transports = [new winston.transports.Console()];

if (!isProduction) {
  const LOGS_DIR = path.join(__dirname, "..", "..", "logs");
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }

  transports.push(
    // Error-only log (≤ 5 MB, last 5 rotations)
    new winston.transports.File({
      filename:  path.join(LOGS_DIR, "error.log"),
      level:     "error",
      maxsize:   5 * 1024 * 1024,
      maxFiles:  5,
    }),
    // Combined log (≤ 20 MB, last 7 rotations)
    new winston.transports.File({
      filename:  path.join(LOGS_DIR, "combined.log"),
      maxsize:   20 * 1024 * 1024,
      maxFiles:  7,
    })
  );
}

// ── Logger Instance ───────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level:      process.env.LOG_LEVEL || (isProduction ? "warn" : "info"),
  format:     isProduction ? prodFormat : devFormat,
  transports,
  // Capture unhandled exceptions and rejections
  exceptionHandlers: [new winston.transports.Console()],
  rejectionHandlers: [new winston.transports.Console()],
});

/**
 * Returns a child logger pre-bound with tenant/campaign context.
 * Use this inside request handlers for structured per-request logs.
 *
 * @example
 *   const log = logger.withContext(req.user.tenantId, campaignId);
 *   log.info("Campaign started", { recipients: 500 });
 */
logger.withContext = (tenantId, campaignId) =>
  logger.child({ tenantId, campaignId });

module.exports = logger;
