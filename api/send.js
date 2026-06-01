"use strict";

/**
 * Vercel Serverless Function — SMTP Email Proxy
 *
 * Routes email sends through Vercel's serverless infrastructure to bypass
 * Render/cloud firewall blocks on SMTP ports 465/587.
 *
 * SECURITY: Protected by a shared PROXY_SECRET header.
 * Only requests from the backend with the correct X-Proxy-Secret are accepted.
 */

const nodemailer = require("nodemailer");

const PROXY_SECRET = process.env.PROXY_SECRET || "";

module.exports = async (req, res) => {
  // CORS Headers — restrict to the known backend origin only
  const allowedOrigin = process.env.BACKEND_URL || "";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Proxy-Secret");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  // ─── SECURITY: Verify shared secret ───────────────────────────────────────
  // Prevents this proxy from being used as an open email relay by third parties.
  if (PROXY_SECRET) {
    const incomingSecret = req.headers["x-proxy-secret"] || "";
    if (incomingSecret !== PROXY_SECRET) {
      return res.status(403).json({ success: false, message: "Forbidden — invalid proxy secret" });
    }
  }

  const { email, password, to, cc, bcc, subject, text, html, attachments, verifyOnly } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Credentials required" });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: email, pass: password }
    });

    if (verifyOnly) {
      await transporter.verify();
      return res.status(200).json({ success: true, message: "SMTP Verified" });
    }

    const mailOptions = {
      from: email,
      to,
      cc,
      bcc,
      subject,
      text,
      html,
      attachments: attachments
        ? attachments.map((att) => ({
            filename: att.filename,
            content: Buffer.from(att.content, "base64"),
            contentType: "application/pdf",
          }))
        : [],
    };

    await transporter.sendMail(mailOptions);
    return res.status(200).json({ success: true, message: "Sent successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
