"use strict";

const { pool } = require("../config/db");
const logger = require("../utils/logger");

/**
 * Tracks an open email event by returning a 1x1 transparent GIF.
 */
async function trackOpen(req, res, next) {
  try {
    const { tenantId, campaignId, email } = req.params;
    const userAgent = req.headers["user-agent"] || "";
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
    const cleanEmail = email.toLowerCase().trim();

    // Insert tracking event (ON CONFLICT DO NOTHING handles duplicate open prevention)
    await pool.query(
      `INSERT INTO tracking_events (tenant_id, campaign_id, email, event, user_agent, ip)
       VALUES ($1, $2, $3, 'open', $4, $5)
       ON CONFLICT (campaign_id, email, event) DO NOTHING`,
      [tenantId, campaignId, cleanEmail, userAgent, ip]
    );

    // Return 1x1 transparent GIF pixel
    const pixelBuf = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
    res.writeHead(200, {
      "Content-Type": "image/gif",
      "Content-Length": pixelBuf.length,
      "Cache-Control": "no-store, no-cache, must-revalidate, private"
    });
    return res.end(pixelBuf);
  } catch (err) {
    logger.error("Error logging open tracking event", { error: err.message });
    // Still return the pixel even if DB log fails so user experience isn't broken
    const pixelBuf = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
    res.writeHead(200, { "Content-Type": "image/gif", "Content-Length": pixelBuf.length });
    return res.end(pixelBuf);
  }
}

/**
 * Registers an unsubscribe request from a recipient.
 */
async function unsubscribe(req, res, next) {
  try {
    const { tenantId } = req.params;
    const email = req.query.email?.toLowerCase().trim();

    if (!email || !tenantId) {
      return res.status(400).send("<h3>Error</h3><p>Invalid unsubscribe request parameters.</p>");
    }

    await pool.query(
      `INSERT INTO unsubscribes (tenant_id, email)
       VALUES ($1, $2)
       ON CONFLICT (tenant_id, email) DO NOTHING`,
      [tenantId, email]
    );

    logger.info("Recipient unsubscribed from tenant mailing list", { tenantId, email });

    res.setHeader("Content-Type", "text/html");
    return res.send(`
      <div style="font-family:sans-serif; text-align:center; padding: 50px 20px;">
        <h2 style="color: #4b5563;">Successfully Unsubscribed</h2>
        <p style="color: #6b7280; font-size: 16px;">${email} has been removed from this sender's mailing list.</p>
        <p style="color: #9ca3af; font-size: 14px; margin-top: 20px;">You will no longer receive campaigns from this tenant.</p>
      </div>
    `);
  } catch (err) {
    next(err);
  }
}

/**
 * Gets campaign analytics including open counts and open rates.
 */
async function getAnalytics(req, res, next) {
  try {
    const { tenantId, role } = req.user;

    let query = `
      SELECT c.id, c.subject, c.total_recipients, c.sent, c.failed, c.status, c.created_at,
             COALESCE(t.opens, 0) as opens
      FROM campaigns c
      LEFT JOIN (
        SELECT campaign_id, COUNT(*) as opens FROM tracking_events GROUP BY campaign_id
      ) t ON c.id = t.campaign_id
    `;
    const params = [];

    if (role !== "admin") {
      query += " WHERE c.tenant_id = $1";
      params.push(tenantId);
    }

    query += " ORDER BY c.created_at DESC";

    const { rows: campaigns } = await pool.query(query, params);

    const analytics = campaigns.map(c => {
      const totalSent = parseInt(c.sent, 10);
      const totalOpens = parseInt(c.opens, 10);
      const openRate = totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0;
      
      return {
        id: c.id,
        subject: c.subject,
        date: c.created_at,
        totalRecipients: c.total_recipients,
        sent: totalSent,
        failed: parseInt(c.failed, 10),
        status: c.status,
        opens: totalOpens,
        openRate: openRate
      };
    });

    return res.json({
      success: true,
      analytics
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  trackOpen,
  unsubscribe,
  getAnalytics
};
