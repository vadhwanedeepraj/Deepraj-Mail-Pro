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
  const useProxy = vercelProxyUrl && 
                    !vercelProxyUrl.includes("localhost") && 
                    !vercelProxyUrl.includes("127.0.0.1") && 
                    !vercelProxyUrl.includes("onrender.com");

  try {
    if (useProxy) {
      logger.info("Routing email dispatch via Vercel Serverless Proxy", { to, proxy: vercelProxyUrl });
      const response = await fetch(vercelProxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, password, to, cc, bcc, subject, text, html, attachments, verifyOnly
        })
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.message || "Vercel proxy relay failed");
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
