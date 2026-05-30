const winston = require("winston");
const path = require("path");
const fs = require("fs");

// Ensure logs directory exists at backend/logs
const LOGS_DIR = path.join(__dirname, "..", "..", "logs");
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

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

// Production JSON format (ideal for log aggregators like Datadog, ELK, Grafana Loki)
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const isProduction = process.env.NODE_ENV === "production";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: isProduction ? prodFormat : devFormat,
  transports: [
    // Output all logs to console
    new winston.transports.Console(),
    
    // Write all errors to error.log
    new winston.transports.File({ 
      filename: path.join(LOGS_DIR, "error.log"), 
      level: "error",
      maxsize: 5242880, // 5MB limit
      maxFiles: 5
    }),
    
    // Write all operational logs to combined.log
    new winston.transports.File({ 
      filename: path.join(LOGS_DIR, "combined.log"),
      maxsize: 10485760, // 10MB limit
      maxFiles: 5
    })
  ]
});

// Export helper to add custom context fields easily
logger.withContext = (tenantId, campaignId) => {
  return logger.child({ tenantId, campaignId });
};

module.exports = logger;
