"use strict";

const fs = require("fs");
const { pool } = require("../config/db");
const logger = require("../utils/logger");
const { sendEmailWithBypass } = require("./emailService");
const { decrypt } = require("./encryptionService");

// In-memory active campaign tracking and cancellations
const activeCampaigns = new Map();
const activeCancellations = new Set();

const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/**
 * Runs the email campaign, sending emails, saving results, and tracking progress.
 * 
 * @param {object} payload - Campaign parameters
 * @param {function} sendEvent - Event callback for SSE / WebSocket updates
 */
async function runCampaign(payload, sendEvent = () => {}) {
  const {
    tenantId,
    cc,
    bcc,
    subject,
    bodyWith,
    bodyWithout,
    recipients,
    rateLimit,
    attachments,
    campaignId,
    backendHost,
    vercelProxyUrl
  } = payload;

  const parsedRecipients = JSON.parse(recipients || "[]");
  const VERCEL_PROXY_URL = vercelProxyUrl || "https://email-proxy-one.vercel.app/api/send";

  // 1. Retrieve and decrypt SMTP credentials
  const { rows: smtpRows } = await pool.query(
    "SELECT smtp_email, encrypted_pass, iv, auth_tag FROM smtp_credentials WHERE tenant_id = $1 LIMIT 1",
    [tenantId]
  );
  if (smtpRows.length === 0) {
    throw new Error("No SMTP credentials configured. Please set them up in Settings first.");
  }
  const { smtp_email, encrypted_pass, iv, auth_tag } = smtpRows[0];
  const decryptedPassword = decrypt(encrypted_pass, iv, auth_tag);

  // 2. Track in-memory active campaign details
  activeCampaigns.set(campaignId, {
    campaignId,
    tenantId,
    email: smtp_email,
    subject,
    progress: 0,
    total: parsedRecipients.length,
    currentEmail: "",
    status: "sending"
  });

  // 3. Create campaign record in PostgreSQL
  await pool.query(
    `INSERT INTO campaigns (id, tenant_id, subject, total_recipients, sent, failed, status)
     VALUES ($1, $2, $3, $4, 0, 0, 'running')`,
    [campaignId, tenantId, subject, parsedRecipients.length]
  );

  // 4. Fetch unsubscribe list for tenant isolation
  const { rows: unsubRows } = await pool.query(
    "SELECT email FROM unsubscribes WHERE tenant_id = $1",
    [tenantId]
  );
  const unsubscribesList = unsubRows.map(u => u.email.toLowerCase().trim());

  let sent = 0;
  let failed = 0;
  let isCancelled = false;

  for (let i = 0; i < parsedRecipients.length; i++) {
    const row = parsedRecipients[i];
    const { to, name, id, templateVars } = row;

    // Check for cancellation
    if (activeCancellations.has(campaignId)) {
      logger.warn(`Campaign ${campaignId} cancelled by Admin mid-dispatch`);
      isCancelled = true;
      
      await pool.query(
        `INSERT INTO campaign_results (campaign_id, tenant_id, to_email, status, attach_status, reason)
         VALUES ($1, $2, $3, 'cancelled', NULL, 'Cancelled by Administrator')`,
        [campaignId, tenantId, to || "—"]
      );

      sendEvent({ type: "progress", index: i, total: parsedRecipients.length, to: "—", status: "cancelled" });
      break;
    }

    // Update active campaign details
    if (activeCampaigns.has(campaignId)) {
      const activeObj = activeCampaigns.get(campaignId);
      activeObj.progress = i;
      activeObj.currentEmail = to || "";
    }

    if (!to || !isValidEmail(to)) {
      failed++;
      await pool.query(
        `INSERT INTO campaign_results (campaign_id, tenant_id, to_email, status, attach_status, reason)
         VALUES ($1, $2, $3, 'invalid', NULL, 'Bad email format')`,
        [campaignId, tenantId, to || ""]
      );
      sendEvent({ type: "progress", index: i, total: parsedRecipients.length, to: to || "", status: "invalid" });
      continue;
    }

    if (unsubscribesList.includes(to.toLowerCase().trim())) {
      failed++;
      await pool.query(
        `INSERT INTO campaign_results (campaign_id, tenant_id, to_email, status, attach_status, reason)
         VALUES ($1, $2, $3, 'invalid', NULL, 'Unsubscribed')`,
        [campaignId, tenantId, to]
      );
      sendEvent({ type: "progress", index: i, total: parsedRecipients.length, to, status: "invalid" });
      continue;
    }

    // Attachment Match Logic
    let attachPath = null;
    let attachStatus = "no_pdf";
    const lookupKeys = [
      id?.toString().toLowerCase().trim(),
      name?.toString().toLowerCase().trim()
    ].filter(Boolean);

    if (attachments) {
      for (const key of lookupKeys) {
        if (attachments[key]) {
          attachPath = attachments[key];
          attachStatus = "matched";
          break;
        }
      }
    }

    const renderTemplate = (tpl, vars) => tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
    const renderedHtml = renderTemplate(attachPath ? bodyWith : bodyWithout, templateVars || {});
    
    // Tracking/Unsubscribe Links
    const pixelUrl = `${backendHost}/api/track/open/${tenantId}/${campaignId}/${encodeURIComponent(to)}`;
    const unsubUrl = `${backendHost}/api/unsubscribe/${tenantId}?email=${encodeURIComponent(to)}`;
    
    const unsubFooter = `<div style="margin-top:40px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;"><p><a href="${unsubUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a></p></div>`;
    const trackedHtml = `${renderedHtml}${unsubFooter}<img src="${pixelUrl}" width="1" height="1" style="display:none;" />`;

    let pdfAttachment = undefined;
    if (attachPath) {
      try {
        const fileContent = fs.readFileSync(attachPath, { encoding: 'base64' });
        pdfAttachment = [{
          filename: `${id || name || "document"}.pdf`,
          content: fileContent
        }];
      } catch (e) {
        logger.error(`Failed to read attachment at path: ${attachPath}`, { error: e.message });
      }
    }

    let success = false;
    let lastError = "";

    // Retry loop (3 attempts)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await sendEmailWithBypass({
          vercelProxyUrl: VERCEL_PROXY_URL,
          email: smtp_email,
          password: decryptedPassword,
          to,
          cc: cc || undefined,
          bcc: bcc || undefined,
          subject: renderTemplate(subject, templateVars || {}),
          text: renderedHtml.replace(/<[^>]*>?/gm, '') + `\n\nTo unsubscribe, visit: ${unsubUrl}`,
          html: `<div style="font-family:sans-serif;line-height:1.6">${trackedHtml}</div>`,
          attachments: pdfAttachment,
          verifyOnly: false
        });

        success = true;
        break; // exit retry
      } catch (err) {
        lastError = err.message;
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }

    if (success) {
      sent++;
      await pool.query(
        `INSERT INTO campaign_results (campaign_id, tenant_id, to_email, status, attach_status, reason)
         VALUES ($1, $2, $3, 'sent', $4, NULL)`,
        [campaignId, tenantId, to, attachStatus]
      );
      sendEvent({ type: "progress", index: i, total: parsedRecipients.length, to, status: "sent" });
    } else {
      failed++;
      await pool.query(
        `INSERT INTO campaign_results (campaign_id, tenant_id, to_email, status, attach_status, reason)
         VALUES ($1, $2, $3, 'error', $4, $5)`,
        [campaignId, tenantId, to, attachStatus, lastError]
      );
      sendEvent({ type: "progress", index: i, total: parsedRecipients.length, to, status: "error", reason: lastError });
    }

    // Respect rate limit (minimum 0.5s floor)
    const delay = Math.max(parseFloat(rateLimit || 1), 0.5) * 1000;
    await new Promise(r => setTimeout(r, delay));
  }

  // 5. Clean up active maps
  activeCampaigns.delete(campaignId);
  activeCancellations.delete(campaignId);

  // 6. Update final campaign status
  const finalStatus = isCancelled ? "cancelled" : (failed === parsedRecipients.length ? "failed" : "completed");
  await pool.query(
    "UPDATE campaigns SET sent = $1, failed = $2, status = $3 WHERE id = $4",
    [sent, failed, finalStatus, campaignId]
  );

  // 7. Update tenant sent quota (clients only)
  const todayStr = new Date().toISOString().slice(0, 10);
  await pool.query(
    `UPDATE users
     SET sent_today = CASE WHEN last_sent_date = $1 THEN sent_today + $2 ELSE $2 END,
         last_sent_date = $1
     WHERE tenant_id = $3 AND role != 'admin'`,
    [todayStr, sent, tenantId]
  );

  sendEvent({ type: "done", results: { sent, failed, status: finalStatus } });
}

function getActiveCampaigns() {
  return Array.from(activeCampaigns.values());
}

function cancelCampaign(campaignId) {
  activeCancellations.add(campaignId);
}

module.exports = {
  runCampaign,
  getActiveCampaigns,
  cancelCampaign
};
