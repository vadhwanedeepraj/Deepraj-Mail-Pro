"use strict";

const nodemailer = require("nodemailer");
const fetch = require("node-fetch");
const logger = require("../utils/logger");

/**
 * Sends an email, using Vercel SMTP firewall bypass proxy if specified.
 * Otherwise sends directly via Nodemailer.
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

  const isRunningOnRender = process.env.RENDER === "true" || process.env.NODE_ENV === "production";

  // If the proxy URL points back to Render itself, swap it for the real Vercel proxy
  // (Render's free tier blocks outbound SMTP ports 465/587)
  let effectiveProxyUrl = vercelProxyUrl;
  if (isRunningOnRender) {
    // Under Render/Production environment, direct SMTP port 465/587 connections are blocked.
    // We must route through the Vercel proxy. Swap missing or localhost/Render URLs.
    if (!effectiveProxyUrl || 
        effectiveProxyUrl.includes("onrender.com") || 
        effectiveProxyUrl.includes("localhost") || 
        effectiveProxyUrl.includes("127.0.0.1")) {
      effectiveProxyUrl = DEFAULT_VERCEL_PROXY;
    }
  }

  const useProxy = effectiveProxyUrl && 
                    !effectiveProxyUrl.includes("localhost") && 
                    !effectiveProxyUrl.includes("127.0.0.1");

  try {
    if (useProxy) {
      logger.info("Routing email dispatch via Vercel Serverless Proxy", { to, proxy: effectiveProxyUrl });
      const response = await fetch(effectiveProxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, password, to, cc, bcc, subject, text, html, attachments, verifyOnly
        })
      });
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
          content: Buffer.from(att.content, 'base64'),
          contentType: "application/pdf"
        })) : []
      };

      await transporter.sendMail(mailOptions);
      return { success: true, message: "Sent successfully (Direct)" };
    }
  } catch (err) {
    let errorMsg = err.message;
    if (!useProxy && (err.code === 'ETIMEDOUT' || err.code === 'ESOCKET' || err.message.includes('timeout') || err.message.includes('connect'))) {
      errorMsg += ". (Render free tier blocks SMTP ports 465/587. Please open the app via your Vercel domain to bypass this firewall dynamically!)";
    }
    throw new Error(errorMsg);
  }
}

module.exports = {
  sendEmailWithBypass
};
