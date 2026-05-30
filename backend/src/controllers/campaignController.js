"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pool } = require("../config/db");
const logger = require("../utils/logger");
const { getQueue, queueEvents } = require("../../queue");

const ATTACHMENTS_DIR = path.join(__dirname, "..", "..", "attachments");

if (!fs.existsSync(ATTACHMENTS_DIR)) {
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
}

/**
 * Handles SSE bulk email dispatch campaign or schedules it.
 */
async function sendBulk(req, res, next) {
  const { tenantId, role } = req.user;
  const { scheduleTime, ...bodyFields } = req.body;
  const uploadedFiles = req.files?.attachments || [];

  const client = await pool.connect();
  try {
    const recipients = JSON.parse(req.body.recipients || "[]");

    // 1. Quota Verification (Skip for admin)
    if (role !== "admin") {
      await client.query("BEGIN");
      
      const { rows } = await client.query(
        `SELECT daily_quota, sent_today, last_sent_date
         FROM users
         WHERE tenant_id = $1 AND role = 'client'
         FOR UPDATE`,
        [tenantId]
      );

      if (rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ success: false, message: "Client profile not found" });
      }

      const user = rows[0];
      const todayStr = new Date().toISOString().slice(0, 10);
      let sentToday = user.sent_today;

      // Reset daily quota if last_sent_date is yesterday/older
      const userLastSentStr = user.last_sent_date instanceof Date 
        ? user.last_sent_date.toISOString().slice(0, 10) 
        : String(user.last_sent_date).slice(0, 10);
      
      if (userLastSentStr !== todayStr) {
        sentToday = 0;
      }

      if (sentToday + recipients.length > user.daily_quota) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: `Daily sending quota exceeded. You have sent ${sentToday}/${user.daily_quota} emails today. This campaign has ${recipients.length} recipients, exceeding your remaining quota.`
        });
      }

      await client.query("COMMIT");
    }

    // 2. Process and move uploaded attachments to permanent path
    const attachmentMap = {};
    for (const file of uploadedFiles) {
      const originalName = file.originalname.replace(/\.pdf$/i, "").trim().toLowerCase();
      const permPath = path.join(ATTACHMENTS_DIR, file.filename + ".pdf");
      fs.renameSync(file.path, permPath);
      attachmentMap[originalName] = permPath;
    }

    const campaignId = crypto.randomUUID();
    const payload = {
      ...bodyFields,
      tenantId,
      attachments: attachmentMap,
      campaignId,
      backendHost: process.env.BACKEND_URL || (req.protocol + "://" + req.get("host"))
    };

    // 3. Schedule Campaign vs Dispatch Campaign
    if (scheduleTime) {
      await pool.query(
        `INSERT INTO scheduled_jobs (tenant_id, schedule_time, status, payload)
         VALUES ($1, $2, 'pending', $3)`,
        [tenantId, scheduleTime, payload]
      );
      logger.info("Campaign scheduled successfully", { campaignId, tenantId, scheduleTime });
      return res.json({ success: true, message: "Campaign scheduled", scheduled: true });
    } else {
      logger.info("Queueing immediate campaign dispatch", { campaignId, tenantId });

      // Send SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      // Keepalive ping (avoid Render proxy timeout)
      const keepAlive = setInterval(() => {
        try {
          res.write(": keepalive\n\n");
        } catch (_) {}
      }, 20000);

      const cleanup = () => {
        clearInterval(keepAlive);
        queueEvents.off(`progress:${campaignId}`, onProgress);
        queueEvents.off(`done:${campaignId}`, onDone);
        queueEvents.off(`error:${campaignId}`, onError);
      };

      const onProgress = (data) => {
        try {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (_) {}
      };

      const onDone = (data) => {
        try {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (_) {}
        cleanup();
        res.end();
      };

      const onError = (data) => {
        try {
          res.write(`data: ${JSON.stringify({ type: "progress", status: "error", reason: data.error })}\n\n`);
        } catch (_) {}
        cleanup();
        res.end();
      };

      queueEvents.on(`progress:${campaignId}`, onProgress);
      queueEvents.on(`done:${campaignId}`, onDone);
      queueEvents.on(`error:${campaignId}`, onError);

      res.on("close", () => {
        logger.info("SSE client disconnected mid-campaign", { campaignId });
        cleanup();
      });

      const emailQueue = getQueue();
      await emailQueue.add("send-campaign", payload);
    }
  } catch (err) {
    if (role !== "admin") {
      try { await client.query("ROLLBACK"); } catch (_) {}
    }
    next(err);
  } finally {
    client.release();
  }
}

/**
 * Gets paginated, searchable campaign history for a user.
 */
async function getCampaigns(req, res, next) {
  try {
    const { tenantId } = req.user;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";
    const sortOrder = req.query.sortOrder === "asc" ? "ASC" : "DESC";

    let query = `
      SELECT id, subject, total_recipients, sent, failed, status, created_at
      FROM campaigns
      WHERE tenant_id = $1
    `;
    const params = [tenantId];

    if (search) {
      query += ` AND subject ILIKE $2`;
      params.push(`%${search}%`);
    }

    // Get count
    let countQuery = `SELECT COUNT(*) FROM campaigns WHERE tenant_id = $1`;
    const countParams = [tenantId];
    if (search) {
      countQuery += ` AND subject ILIKE $2`;
      countParams.push(`%${search}%`);
    }
    const { rows: countRows } = await pool.query(countQuery, countParams);
    const total = parseInt(countRows[0].count, 10);

    query += ` ORDER BY created_at ${sortOrder} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows: campaigns } = await pool.query(query, params);

    return res.json({
      success: true,
      campaigns,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Gets details of a single campaign, including recipient dispatch logs.
 */
async function getCampaignDetails(req, res, next) {
  try {
    const { id } = req.params;
    const { tenantId, role } = req.user;

    // Fetch the campaign details
    const campaignQuery = role === "admin"
      ? "SELECT id, tenant_id, subject, total_recipients, sent, failed, status, created_at FROM campaigns WHERE id = $1 LIMIT 1"
      : "SELECT id, tenant_id, subject, total_recipients, sent, failed, status, created_at FROM campaigns WHERE id = $1 AND tenant_id = $2 LIMIT 1";
    
    const campaignParams = role === "admin" ? [id] : [id, tenantId];
    const { rows: campaigns } = await pool.query(campaignQuery, campaignParams);

    if (campaigns.length === 0) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }

    const campaign = campaigns[0];

    // Fetch individual recipient results
    const resultsQuery = "SELECT to_email, status, attach_status, reason, created_at FROM campaign_results WHERE campaign_id = $1 ORDER BY created_at ASC";
    const { rows: results } = await pool.query(resultsQuery, [id]);

    return res.json({
      success: true,
      campaign,
      results
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  sendBulk,
  getCampaigns,
  getCampaignDetails
};
