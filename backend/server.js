"use strict";

// Initialize environment variable validation first to fail fast
require("./src/config/env");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const logger = require("./src/utils/logger");
const { pool } = require("./src/config/db");
const { runMigrations } = require("./src/db/migrate");
const { initializeQueueWorker } = require("./queue");
const { runCampaign } = require("./src/services/campaignRunner");
const { initializeCleanupCron } = require("./src/services/cleanupService");

// Routers
const authRouter = require("./src/routes/auth");
const adminRouter = require("./src/routes/admin");
const smtpRouter = require("./src/routes/smtp");
const campaignsRouter = require("./src/routes/campaigns");
const trackingRouter = require("./src/routes/tracking");

// Controllers (for direct mapping fallback)
const smtpController = require("./src/controllers/smtpController");
const campaignController = require("./src/controllers/campaignController");

// Middlewares
const errorHandler = require("./src/middleware/errorHandler");
const { apiLimiter } = require("./src/middleware/rateLimiter");

const app = express();

// 1. Security & Body Parsing Middlewares
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" } // allows open tracking pixel fetching
}));

// CORS Configuration
const allowedOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(",").map(o => o.trim()) 
  : [];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or server-to-server)
    if (!origin) return callback(null, true);
    
    // In development mode, allow localhost/127.0.0.1
    const isDev = process.env.NODE_ENV !== "production";
    const isLocalhost = origin.includes("localhost") || origin.includes("127.0.0.1");
    
    if ((isDev && isLocalhost) || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
      return callback(null, true);
    }
    
    logger.warn(`CORS blocked request from origin: ${origin}`);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// 2. Health check route
app.get("/api/ping", (req, res) => res.json({ ok: true, ts: Date.now() }));

// 3. Mount Routers
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/smtp", smtpRouter);
app.use("/api", campaignsRouter); // mounts /api/send-bulk, /api/campaigns, /api/campaigns/:id
app.use("/", trackingRouter); // mounts /api/track/open, /api/unsubscribe, /api/analytics

// 4. Backward Compatibility Direct Mappings
app.post("/api/test-smtp", apiLimiter, smtpController.testDirect);

// Serve static frontend build assets if they exist (for unified Docker/Render deploys)
const path = require("path");
const fs = require("fs");
const buildPath = path.join(__dirname, "..", "frontend", "build");
if (fs.existsSync(buildPath)) {
  logger.info(`Serving static frontend assets from: ${buildPath}`);
  app.use(express.static(buildPath));
  app.get("*", (req, res, next) => {
    if (req.url.startsWith("/api")) return next();
    res.sendFile(path.join(buildPath, "index.html"), (err) => {
      if (err) next();
    });
  });
}

// 5. Centralized Error Handler (must be registered last)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

/**
 * Starts the application server.
 */
async function startServer() {
  try {
    // A. Run Database Migrations and Admin Seeding
    await runMigrations();

    // B. Initialize Queue Worker (BullMQ / Local fallback)
    initializeQueueWorker(async (job) => {
      const { campaignId, scheduledJobId } = job.data;
      logger.info("Queue Worker processing email dispatch campaign", { campaignId });
      
      const sendEvent = (data) => {
        const { queueEvents } = require("./queue");
        if (data.type === "progress") {
          queueEvents.emit(`progress:${campaignId}`, data);
        } else if (data.type === "done") {
          queueEvents.emit(`done:${campaignId}`, data);
          
          // If it was a scheduled campaign, mark it as completed in PostgreSQL
          if (scheduledJobId) {
            pool.query(
              "UPDATE scheduled_jobs SET status = 'completed' WHERE id = $1",
              [scheduledJobId]
            ).then(() => {
              logger.info("Successfully updated scheduled job state to completed", { scheduledJobId });
            }).catch(err => {
              logger.error("Failed to update scheduled job state to completed", { scheduledJobId, error: err.message });
            });
          }
        }
      };

      try {
        await runCampaign(job.data, sendEvent);
        logger.info("Queue Worker successfully completed email dispatch campaign", { campaignId });
      } catch (err) {
        logger.error("Queue Worker campaign execution failed", { campaignId, error: err.message });
        const { queueEvents } = require("./queue");
        queueEvents.emit(`error:${campaignId}`, { error: err.message });

        if (scheduledJobId) {
          pool.query(
            "UPDATE scheduled_jobs SET status = 'failed', error = $1 WHERE id = $2",
            [err.message, scheduledJobId]
          ).catch(dbErr => {
            logger.error("Failed to update failed scheduled job state", { scheduledJobId, error: dbErr.message });
          });
        }
        throw err;
      }
    });

    // C. Initialize Cron Jobs
    initializeCleanupCron();

    // Background Scheduler for Scheduled Campaigns
    const cron = require("node-cron");
    cron.schedule("* * * * *", async () => {
      const now = new Date();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // 1. Timeout active jobs taking longer than 15 minutes
        const fifteenMinsAgo = new Date(Date.now() - 15 * 60000);
        await client.query(
          `UPDATE scheduled_jobs
           SET status = 'failed', error = 'Timeout — worker took too long or crashed'
           WHERE status = 'running' AND started_at <= $1`,
          [fifteenMinsAgo]
        );

        // 2. Select pending jobs ready to execute
        const { rows: jobsToRun } = await client.query(
          `UPDATE scheduled_jobs
           SET status = 'running', started_at = NOW()
           WHERE status = 'pending' AND schedule_time <= $1
           RETURNING id, payload`,
          [now]
        );

        await client.query("COMMIT");

        // 3. Queue jobs for processing
        if (jobsToRun.length > 0) {
          const emailQueue = getQueue();
          for (const job of jobsToRun) {
            logger.info("Queuing scheduled campaign for background execution", { jobId: job.id, campaignId: job.payload.campaignId });
            await emailQueue.add("send-campaign", {
              ...job.payload,
              scheduledJobId: job.id
            });
          }
        }
      } catch (err) {
        await client.query("ROLLBACK");
        logger.error("Failed executing scheduled job checker cron", { error: err.message });
      } finally {
        client.release();
      }
    });

    // D. Bind Port and Listen
    app.listen(PORT, () => {
      logger.info(`🚀 Deepraj Mail Pro server running in ${process.env.NODE_ENV || "development"} mode on port ${PORT}`);
    });
  } catch (err) {
    logger.error("Failed to start Deepraj Mail Pro server", { error: err.message });
    process.exit(1);
  }
}

startServer();
