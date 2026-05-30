const nodemailer = require("nodemailer");

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const { email, password, to, cc, bcc, subject, text, html, attachments, verifyOnly } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Credentials required" });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: email, pass: password },
      pool: true,
      maxConnections: 1
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
      attachments: attachments ? attachments.map(att => ({
        filename: att.filename,
        content: Buffer.from(att.content, 'base64'),
        contentType: "application/pdf"
      })) : []
    };

    await transporter.sendMail(mailOptions);
    return res.status(200).json({ success: true, message: "Sent successfully" });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
