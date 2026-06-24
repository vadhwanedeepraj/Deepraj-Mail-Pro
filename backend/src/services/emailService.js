"use strict";

/**
 * Email Service — routes sends through Vercel serverless proxy to bypass
 * Render/cloud SMTP port firewall blocks (ports 465/587).
 *
 * ISSUE-29 Fix: Removed `node-fetch` dependency. Node 18+ provides a built-in
 * global `fetch` that is API-compatible. No import needed.
 *
 * ISSUE-08 Fix: Sends X-Proxy-Secret header to authenticate with the Vercel proxy
 * and prevent open relay abuse.
 */

const nodemailer = require("nodemailer");
const logger = require("../utils/logger");

const PROXY_SECRET = process.env.PROXY_SECRET || "";

/**
 * Sends an email, using Vercel SMTP firewall bypass proxy if specified.
 * Otherwise sends directly via Nodemailer (requires BYPASS_PROXY_LOCALLY=true).
 */
async function sendEmailWithBypass({
  vercelProxyUrl,
  email,
  password,
  to,
  cc,
  bcc,
  subject,
  text,
  html,
  attachments,
  verifyOnly
}) {
  const DEFAULT_VERCEL_PROXY = process.env.VERCEL_PROXY_URL || "https://email-proxy-one.vercel.app/api/send";

  // ALWAYS route through the Vercel proxy by default to bypass firewalls and ISP blocks.
  // If the provided proxy URL is empty, points back to Render, or points to localhost/127.0.0.1
  // (which cannot run serverless functions), we automatically swap it to the production Vercel proxy.
  let effectiveProxyUrl = vercelProxyUrl;
  if (!effectiveProxyUrl || 
      effectiveProxyUrl.includes("onrender.com") || 
      effectiveProxyUrl.includes("localhost") || 
      effectiveProxyUrl.includes("127.0.0.1")) {
    effectiveProxyUrl = DEFAULT_VERCEL_PROXY;
  }

  // By default we always use the Vercel proxy to guarantee delivery.
  // Developers can set BYPASS_PROXY_LOCALLY=true in their local .env file if they want to test direct SMTP locally.
  const useProxy = process.env.BYPASS_PROXY_LOCALLY !== "true";

  try {
    if (useProxy) {
      logger.info("Routing email dispatch via Vercel Serverless Proxy", { to, proxy: effectiveProxyUrl });

      // Use Node 18 built-in fetch with a 25-second timeout so that
      // Vercel serverless cold-starts or SMTP hangs fail fast and allow retries.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      let response;
      try {
        response = await fetch(effectiveProxyUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // ISSUE-08 Fix: Authenticate with the proxy using shared secret
            "X-Proxy-Secret": PROXY_SECRET,
          },
          body: JSON.stringify({
            email, password, to, cc, bcc, subject, text, html, attachments, verifyOnly
          }),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const responseText = await response.text();
      let json;
      try {
        json = responseText ? JSON.parse(responseText) : {};
      } catch (e) {
        throw new Error(`Vercel proxy returned invalid response: ${responseText.substring(0, 100) || "Empty body"} (HTTP ${response.status})`);
      }
      if (!response.ok || !json.success) {
        throw new Error(json.message || `Vercel proxy relay failed with HTTP ${response.status}`);
      }
      return json;
    } else {
      logger.info("Sending email directly from backend server", { to });
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: email, pass: password },
        pool: true,
        maxConnections: 1
      });

      if (verifyOnly) {
        await transporter.verify();
        return { success: true, message: "SMTP Verified (Direct)" };
      }

      const mailOptions = {
        from: email,
        to,
        cc,
        bcc,
        subject,
        text,
        html,
        attachments: attachments ? attachments.map(att => ({
          filename: att.filename,
          content: Buffer.from(att.content, "base64"),
          contentType: "application/pdf"
        })) : []
      };

      await transporter.sendMail(mailOptions);
      return { success: true, message: "Sent successfully (Direct)" };
    }
  } catch (err) {
    let errorMsg = err.message;
    if (!useProxy && (err.code === "ETIMEDOUT" || err.code === "ESOCKET" || err.message.includes("timeout") || err.message.includes("connect"))) {
      errorMsg += ". (Render free tier blocks SMTP ports 465/587. Please open the app via your Vercel domain to bypass this firewall dynamically!)";
    }
    throw new Error(errorMsg);
  }
}

module.exports = {
  sendEmailWithBypass
};
