const winston = require("winston");
const path = require("path");
const fs = require("fs");

const isProduction = process.env.NODE_ENV === "production";

// Custom format for clean development console logs
const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaString = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : "";
    return `[${timestamp}] ${level}: ${message}${stack ? `\n${stack}` : ""}${metaString}`;
  })
);

// Production JSON format (ideal for log aggregators like Datadog, ELK, Grafana Loki, Render Logs)
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Always log to console (Render aggregates console output automatically)
const transports = [new winston.transports.Console()];

// File transports only in development — Render's filesystem may be read-only in production
if (!isProduction) {
  const LOGS_DIR = path.join(__dirname, "..", "..", "logs");
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }

  transports.push(
    new winston.transports.File({
      filename: path.join(LOGS_DIR, "error.log"),
      level: "error",
      maxsize: 5242880, // 5MB limit
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(LOGS_DIR, "combined.log"),
      maxsize: 10485760, // 10MB limit
      maxFiles: 5,
    })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: isProduction ? prodFormat : devFormat,
  transports,
});

// Export helper to add custom context fields easily
logger.withContext = (tenantId, campaignId) => {
  return logger.child({ tenantId, campaignId });
};

module.exports = logger;

