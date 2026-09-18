"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pool } = require("../config/db");
const logger = require("../utils/logger");
const { getQueue, queueEvents } = require("../../queue");
const campaignRunner = require("../services/campaignRunner");
const { sendEmailWithBypass } = require("../services/emailService");
const { decrypt } = require("../services/encryptionService");

const ATTACHMENTS_DIR = path.join(__dirname, "..", "..", "attachments");

if (!fs.existsSync(ATTACHMENTS_DIR)) {
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
}

/**
 * Handles SSE bulk email dispatch campaign or schedules it.
 *
 * ISSUE-12 Fix: DB client is now acquired and released within its own scope (quota
 * check only). It is no longer held open during the entire SSE lifecycle.
 *
 * ISSUE-25 Fix: Uses fs.copyFileSync+unlinkSync instead of fs.renameSync to avoid
 * EXDEV errors when multer writes to /tmp (tmpfs) and we move to /app/backend/attachments
 * (overlayfs) — two different filesystems in Docker.
 *
 * ISSUE-26 Fix: Validates attachment filenames against path traversal attacks.
 *
 * ISSUE-34 Fix: Safe JSON.parse for recipients with proper error response.
 */
async function sendBulk(req, res, next) {
  const { tenantId, role } = req.user;
  const { scheduleTime, ...bodyFields } = req.body;
  const uploadedFiles = req.files?.attachments || [];

  // ISSUE-34 Fix: Safe JSON parse — returns a clean 400 instead of leaking internals
  let recipients;
  try {
    recipients = JSON.parse(req.body.recipients || "[]");
    if (!Array.isArray(recipients)) throw new Error("Not an array");
  } catch (_) {
    return res.status(400).json({
      success: false,
      message: "Invalid recipients format — field must be a JSON array string"
    });
  }

  try {
    // 1. Quota Verification (Skip for admin)
    // ISSUE-12 Fix: Client is scoped tightly — acquired, used, and released immediately.
    // It is no longer held across the entire SSE response lifecycle.
    if (role !== "admin") {
      const client = await pool.connect();
      try {
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
      } catch (err) {
        try { await client.query("ROLLBACK"); } catch (_) {}
        throw err;
      } finally {
        // ISSUE-12 Fix: Released immediately — no longer leaked into SSE lifetime
        client.release();
      }
    }

    // 2. Process and move uploaded attachments to permanent path
    const attachmentMap = {};
    for (const file of uploadedFiles) {
      // ISSUE-26 Fix: Strip directory components to prevent path traversal attacks
      const safeName = path.basename(file.originalname);
      const originalName = safeName.replace(/\.pdf$/i, "").trim().toLowerCase();
      const permPath = path.join(ATTACHMENTS_DIR, file.filename + ".pdf");

      // ISSUE-25 Fix: Use copyFileSync+unlinkSync instead of renameSync.
      // renameSync fails with EXDEV when source (os.tmpdir() = /tmp = tmpfs) and
      // destination (backend/attachments = overlayfs) are on different filesystems in Docker.
      fs.copyFileSync(file.path, permPath);
      try { fs.unlinkSync(file.path); } catch (_) {} // best-effort temp file cleanup

      attachmentMap[originalName] = permPath;
    }

    const campaignId = crypto.randomUUID();
    const payload = {
      ...bodyFields,  // includes recipients (JSON string), cc, bcc, subject, bodyWith, bodyWithout, rateLimit, vercelProxyUrl
      tenantId,
      attachments: attachmentMap,
      campaignId,
      backendHost: process.env.BACKEND_URL || (req.protocol + "://" + req.get("host"))
    };

    // 3. Schedule Campaign vs Dispatch Campaign
    if (scheduleTime) {
      // ISSUE-04 Fix: Session-only SMTP credentials cannot be persisted in the DB.
      // If a client tries to schedule a campaign using session creds (not admin-saved),
      // the password would be stored plain-text in scheduled_jobs.payload — a security risk.
      // Reject the request with a clear explanation instead.
      if (payload.sessionSmtpPassword) {
        return res.status(400).json({
          success: false,
          message:
            "Scheduled campaigns require saved SMTP credentials. " +
            "Session-only credentials (entered per-session) cannot be stored for scheduled delivery. " +
            "Please ask your administrator to lock SMTP credentials for your account, then retry.",
        });
      }

      // Safety net: always strip session credential fields before DB insert
      // in case the check above is ever bypassed by future code changes.
      const { sessionSmtpEmail: _e, sessionSmtpPassword: _p, ...safePayload } = payload;

      await pool.query(
        `INSERT INTO scheduled_jobs (tenant_id, schedule_time, status, payload)
         VALUES ($1, $2, 'pending', $3)`,
        [tenantId, scheduleTime, safePayload]
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
        try { res.write(": keepalive\n\n"); } catch (_) {}
      }, 20000);

      const cleanup = () => {
        clearInterval(keepAlive);
        queueEvents.off(`progress:${campaignId}`, onProgress);
        queueEvents.off(`done:${campaignId}`, onDone);
        queueEvents.off(`error:${campaignId}`, onError);
      };

      const onProgress = (data) => {
        try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch (_) {}
      };

      const onDone = (data) => {
        try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch (_) {}
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
    next(err);
  }
}

/**
 * Gets paginated, searchable campaign history for a user.
 * Admin can pass ?clientTenantId= to filter by a specific client's tenant.
 */
async function getCampaigns(req, res, next) {
  try {
    const { tenantId, role } = req.user;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";
    const sortOrder = req.query.sortOrder === "asc" ? "ASC" : "DESC";

    // Admin can view a specific client's campaigns via ?clientTenantId=
    const effectiveTenantId = (role === "admin" && req.query.clientTenantId)
      ? req.query.clientTenantId
      : tenantId;

    let query = `
      SELECT id, subject, total_recipients, sent, failed, status, created_at, label, label_color
      FROM campaigns
      WHERE tenant_id = $1
    `;
    const params = [effectiveTenantId];

    if (search) {
      query += ` AND subject ILIKE $2`;
      params.push(`%${search}%`);
    }

    // Get count
    let countQuery = `SELECT COUNT(*) FROM campaigns WHERE tenant_id = $1`;
    const countParams = [effectiveTenantId];
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

async function getActive(req, res, next) {
  try {
    const active = campaignRunner.getActiveCampaigns();
    // Filter active campaigns by the logged-in client's tenantId for security isolation
    const filtered = active.filter(c => c.tenantId === req.user.tenantId);
    return res.json({ success: true, active: filtered });
  } catch (err) {
    next(err);
  }
}

async function cancel(req, res, next) {
  try {
    const { id } = req.params;
    const { tenantId } = req.user;

    const active = campaignRunner.getActiveCampaigns();
    const campaign = active.find(c => c.campaignId === id);
    if (!campaign || campaign.tenantId !== tenantId) {
      return res.status(404).json({ success: false, message: "Active campaign not found or access denied" });
    }

    campaignRunner.cancelCampaign(id);
    logger.warn(`User requested cancel for active campaign: ${id}`);
    return res.json({ success: true, message: "Cancellation request received successfully" });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  sendBulk,
  sendTest,
  getCampaigns,
  getCampaignDetails,
  duplicateCampaign,
  updateCampaignLabel,
  getActive,
  cancel
};

/**
 * Sends a single test email to the logged-in user's own email address.
 * Uses the user's configured SMTP credentials. No DB record is created.
 */
async function sendTest(req, res, next) {
  try {
    const { tenantId } = req.user;
    const { subject, body } = req.body;

    if (!subject || !body) {
      return res.status(400).json({ success: false, message: "subject and body are required" });
    }

    // Fetch SMTP credentials for this tenant
    const { rows: smtpRows } = await pool.query(
      "SELECT smtp_email, encrypted_pass, iv, auth_tag FROM smtp_credentials WHERE tenant_id = $1 LIMIT 1",
      [tenantId]
    );
    if (smtpRows.length === 0) {
      return res.status(400).json({ success: false, message: "No SMTP credentials configured. Set them up in Settings first." });
    }

    const { smtp_email, encrypted_pass, iv, auth_tag } = smtpRows[0];
    const decryptedPassword = decrypt(encrypted_pass, iv, auth_tag);

    await sendEmailWithBypass({
      vercelProxyUrl: process.env.VERCEL_PROXY_URL || "https://email-proxy-one.vercel.app/api/send",
      email: smtp_email,
      password: decryptedPassword,
      to: smtp_email, // Send to self
      subject: `[TEST] ${subject}`,
      html: `<div style="font-family:sans-serif;line-height:1.6">${body}</div>`,
      text: body.replace(/<[^>]*>?/gm, ""),
      verifyOnly: false
    });

    logger.info("Test email sent successfully", { tenantId, smtp_email });
    return res.json({ success: true, message: `Test email sent to ${smtp_email}` });
  } catch (err) {
    next(err);
  }
}

/**
 * Returns the stored body and subject of a campaign for duplication/pre-fill.
 */
async function duplicateCampaign(req, res, next) {
  try {
    const { id } = req.params;
    const { tenantId, role } = req.user;

    const query = role === "admin"
      ? "SELECT id, subject, body_with, body_without, label, label_color FROM campaigns WHERE id = $1 LIMIT 1"
      : "SELECT id, subject, body_with, body_without, label, label_color FROM campaigns WHERE id = $1 AND tenant_id = $2 LIMIT 1";
    const params = role === "admin" ? [id] : [id, tenantId];

    const { rows } = await pool.query(query, params);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }

    return res.json({ success: true, campaign: rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * Updates the label and label_color of a campaign.
 */
async function updateCampaignLabel(req, res, next) {
  try {
    const { id } = req.params;
    const { tenantId } = req.user;
    const { label, labelColor } = req.body;

    const { rows } = await pool.query(
      `UPDATE campaigns SET label = $1, label_color = $2
       WHERE id = $3 AND tenant_id = $4
       RETURNING id, label, label_color`,
      [label || null, labelColor || "blue", id, tenantId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }

    logger.info("Campaign label updated", { campaignId: id, label, labelColor });
    return res.json({ success: true, campaign: rows[0] });
  } catch (err) {
    next(err);
  }
}

