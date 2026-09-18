"use strict";

// Initialize environment variable validation first to fail fast
require("./src/config/env");

const express = require("express");
const cors    = require("cors");
const helmet  = require("helmet");
const crypto  = require("crypto");
const path    = require("path");
const fs      = require("fs");

const logger = require("./src/utils/logger");
const { pool }                          = require("./src/config/db");
const { runMigrations }                 = require("./src/db/migrate");
const { initializeQueueWorker, getQueue } = require("./queue");
const { runCampaign }                   = require("./src/services/campaignRunner");
const { initializeCleanupCron }         = require("./src/services/cleanupService");

// Routers
const authRouter      = require("./src/routes/auth");
const adminRouter     = require("./src/routes/admin");
const smtpRouter      = require("./src/routes/smtp");
const campaignsRouter = require("./src/routes/campaigns");
const trackingRouter  = require("./src/routes/tracking");

// Controller (for backward-compat direct mapping)
const smtpController = require("./src/controllers/smtpController");

// Middlewares
const { errorHandler } = require("./src/middleware/errorHandler");
const { apiLimiter }   = require("./src/middleware/rateLimiter");

const app = express();

// ─── 1. TRUST PROXY ───────────────────────────────────────────────────────────
// Required for Render / Vercel / any reverse-proxy deployment.
// Without this, express-rate-limit sees the proxy's IP instead of the real
// client IP and all requests share the same rate-limit bucket.
app.set("trust proxy", 1);

// ─── 2. SECURITY HEADERS (Helmet) ────────────────────────────────────────────
app.use(
  helmet({
    // Allow open-tracking pixel fetching from external email clients
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // Content Security Policy — tighten for production
    contentSecurityPolicy:
      process.env.NODE_ENV === "production"
        ? {
            directives: {
              defaultSrc:  ["'self'"],
              scriptSrc:   ["'self'"],
              styleSrc:    ["'self'", "'unsafe-inline'"],
              imgSrc:      ["'self'", "data:", "https:"],
              connectSrc:  ["'self'"],
              frameSrc:    ["'none'"],
              objectSrc:   ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false, // Disabled in dev — React dev server injects inline scripts
  })
);

// ─── 3. CORS ──────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : [];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests (curl, health checks, mobile apps)
      if (!origin) return callback(null, true);

      const isDev       = process.env.NODE_ENV !== "production";
      const isLocalhost = origin.includes("localhost") || origin.includes("127.0.0.1");

      if ((isDev && isLocalhost) || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        return callback(null, true);
      }

      logger.warn("CORS blocked request", { origin });
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// ─── 4. BODY PARSING ──────────────────────────────────────────────────────────
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ─── 5. REQUEST ID MIDDLEWARE ─────────────────────────────────────────────────
// Attaches a unique X-Request-ID header to every request for distributed tracing.
// Reuses the header if the upstream proxy (Render, Vercel, nginx) already set it.
app.use((req, _res, next) => {
  req.requestId = req.headers["x-request-id"] || crypto.randomUUID();
  _res.setHeader("X-Request-ID", req.requestId);
  next();
});

// ─── 6. REQUEST LOGGING MIDDLEWARE ───────────────────────────────────────────
// Light-weight access log — logs method, URL, and remote IP for every request.
// Does NOT log bodies to avoid leaking credentials in logs.
app.use((req, _res, next) => {
  logger.info("Incoming request", {
    requestId: req.requestId,
    method:    req.method,
    url:       req.originalUrl,
    ip:        req.ip,
  });
  next();
});

// ─── 7. HEALTH CHECK ─────────────────────────────────────────────────────────
// Render uses this path for its health-check ping.
app.get("/api/ping", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// ─── 8. MOUNT ROUTERS ────────────────────────────────────────────────────────
app.use("/api/auth",  authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/smtp",  smtpRouter);
app.use("/api",       campaignsRouter); // /api/send-bulk, /api/campaigns, /api/campaigns/:id

// ISSUE-13 Fix: Mount tracking router at /api so URLs match:
// /api/track/open/..., /api/unsubscribe/..., /api/analytics
app.use("/api", trackingRouter);

// ─── 9. BACKWARD COMPATIBILITY ───────────────────────────────────────────────
app.post("/api/test-smtp", apiLimiter, smtpController.testDirect);

// ─── 10. STATIC FRONTEND (unified Docker / Render deploys) ───────────────────
const buildPath = path.join(__dirname, "..", "frontend", "build");
if (fs.existsSync(buildPath)) {
  logger.info("Serving static frontend assets", { path: buildPath });
  app.use(express.static(buildPath));
  app.get("*", (req, res, next) => {
    if (req.url.startsWith("/api")) return next();
    res.sendFile(path.join(buildPath, "index.html"), (err) => {
      if (err) next();
    });
  });
}

// ─── 11. CENTRALIZED ERROR HANDLER (must be last) ────────────────────────────
app.use(errorHandler);

// ─── SERVER START ─────────────────────────────────────────────────────────────
// Render injects PORT at runtime. Fall back to 3001 for local dev.
const PORT = parseInt(process.env.PORT || "3001", 10);

async function startServer() {
  try {
    // A. Run Database Migrations and Admin Seeding
    await runMigrations();

    // B. Initialize Queue Worker (BullMQ with Redis, or local in-memory fallback)
    initializeQueueWorker(async (job) => {
      const { campaignId, scheduledJobId } = job.data;
      logger.info("Queue: processing campaign", { campaignId, jobId: job.id });

      const sendEvent = (data) => {
        const { queueEvents } = require("./queue");
        if (data.type === "progress") {
          queueEvents.emit(`progress:${campaignId}`, data);
        } else if (data.type === "done") {
          queueEvents.emit(`done:${campaignId}`, data);

          if (scheduledJobId) {
            pool
              .query("UPDATE scheduled_jobs SET status = 'completed' WHERE id = $1", [scheduledJobId])
              .then(() =>
                logger.info("Scheduled job marked completed", { scheduledJobId })
              )
              .catch((err) =>
                logger.error("Failed to mark scheduled job completed", {
                  scheduledJobId,
                  error: err.message,
                })
              );
          }
        }
      };

      try {
        await runCampaign(job.data, sendEvent);
        logger.info("Queue: campaign completed", { campaignId, jobId: job.id });
      } catch (err) {
        logger.error("Queue: campaign failed", {
          campaignId,
          jobId:  job.id,
          error:  err.message,
        });
        const { queueEvents } = require("./queue");
        queueEvents.emit(`error:${campaignId}`, { error: err.message });

        if (scheduledJobId) {
          pool
            .query(
              "UPDATE scheduled_jobs SET status = 'failed', error = $1 WHERE id = $2",
              [err.message, scheduledJobId]
            )
            .catch((dbErr) =>
              logger.error("Failed to mark scheduled job as failed", {
                scheduledJobId,
                error: dbErr.message,
              })
            );
        }
        throw err;
      }
    });

    // C. Initialize Cleanup Cron
    initializeCleanupCron();

    // D. Scheduled Campaign Cron — runs every minute
    const cron = require("node-cron");
    cron.schedule("* * * * *", async () => {
      const now    = new Date();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // 1. Timeout jobs stuck running for > 15 minutes
        const fifteenMinsAgo = new Date(Date.now() - 15 * 60_000);
        await client.query(
          `UPDATE scheduled_jobs
              SET status = 'failed', error = 'Timeout — worker took too long or crashed'
            WHERE status = 'running' AND started_at <= $1`,
          [fifteenMinsAgo]
        );

        // 2. Pick up pending jobs whose schedule_time has arrived
        const { rows: jobsToRun } = await client.query(
          `UPDATE scheduled_jobs
              SET status = 'running', started_at = NOW()
            WHERE status = 'pending' AND schedule_time <= $1
            RETURNING id, payload`,
          [now]
        );

        await client.query("COMMIT");

        if (jobsToRun.length > 0) {
          const emailQueue = getQueue();
          for (const job of jobsToRun) {
            logger.info("Queuing scheduled campaign", {
              jobId:      job.id,
              campaignId: job.payload.campaignId,
            });
            await emailQueue.add("send-campaign", {
              ...job.payload,
              scheduledJobId: job.id,
            });
          }
        }
      } catch (err) {
        await client.query("ROLLBACK");
        logger.error("Scheduled job cron error", { error: err.message });
      } finally {
        client.release();
      }
    });

    // E. Bind Port
    app.listen(PORT, () => {
      logger.info(`🚀 Deepraj Mail Pro running in ${process.env.NODE_ENV || "development"} mode`, {
        port: PORT,
      });
    });
  } catch (err) {
    logger.error("Failed to start server", { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

startServer();

// ─── GRACEFUL SHUTDOWN ────────────────────────────────────────────────────────
// On SIGTERM (Render deploys, container stops), mark in-flight campaigns as
// 'failed' so they don't stay permanently stuck as 'running' in the DB.
async function gracefulShutdown(signal) {
  logger.warn(`${signal} received — graceful shutdown initiated`);
  try {
    const result = await pool.query(
      `UPDATE campaigns SET status = 'failed' WHERE status = 'running' RETURNING id`
    );
    if (result.rowCount > 0) {
      logger.info(`Marked ${result.rowCount} in-flight campaign(s) as failed`);
    }
  } catch (err) {
    logger.error("Error during shutdown cleanup", { error: err.message });
  }
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));
