const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const cron = require("node-cron");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const upload = multer({ dest: os.tmpdir() });

// Security & Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.disable('x-powered-by'); // Basic security

const ATTACHMENTS_DIR = path.join(__dirname, "attachments");
if (!fs.existsSync(ATTACHMENTS_DIR)) fs.mkdirSync(ATTACHMENTS_DIR);

const JWT_SECRET = process.env.JWT_SECRET || "enterprise-secure-jwt-key-2026-prod";

// ─── DATA LAYER (MOCK DATABASE) ─────────────────────────────────────────────
// In Phase 2, this gets replaced by PostgreSQL + RLS.
// For now, this provides perfect Tenant Isolation logic.
const db = {
  read: (file) => {
    const p = path.join(__dirname, file);
    if (!fs.existsSync(p)) return [];
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; }
  },
  write: (file, data) => fs.writeFileSync(path.join(__dirname, file), JSON.stringify(data, null, 2)),
  
  users: () => db.read('users.json'),
  saveUsers: (d) => db.write('users.json', d),
  
  campaigns: () => db.read('campaigns.json'),
  saveCampaigns: (d) => db.write('campaigns.json', d),
  
  tracking: () => db.read('tracking.json'),
  saveTracking: (d) => db.write('tracking.json', d),
  
  scheduled: () => db.read('scheduled.json'),
  saveScheduled: (d) => db.write('scheduled.json', d),
  
  unsubscribes: () => db.read('unsubscribes.json'),
  saveUnsubscribes: (d) => db.write('unsubscribes.json', d)
};

// Init Default Admin
if (db.users().length === 0) {
  const adminId = crypto.randomUUID();
  db.saveUsers([{ 
    id: adminId, 
    tenantId: adminId, // Admin is their own tenant
    email: "admin@example.com", 
    password: bcrypt.hashSync("password", 10), 
    role: "admin", 
    mustResetPassword: false 
  }]);
}

// ─── MIDDLEWARE ─────────────────────────────────────────────────────────────
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: "Forbidden" });
    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ success: false, message: "Admin access required" });
  next();
};

const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// ─── AUTHENTICATION & ADMIN ROUTES ──────────────────────────────────────────

app.post("/api/admin/clients", authenticateToken, requireAdmin, async (req, res) => {
  let { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: "Email required" });
  email = email.toLowerCase().trim();
  if (!isValidEmail(email)) return res.status(400).json({ success: false, message: "Invalid email format" });
  
  const tempPassword = crypto.randomBytes(6).toString('hex');
  const hashedPassword = await bcrypt.hash(tempPassword, 10);
  const newTenantId = crypto.randomUUID(); 
  
  const users = db.users(); // Read AFTER await to prevent race condition
  if (users.find(u => u.email === email)) return res.status(400).json({ success: false, message: "User already exists" });
  
  users.push({ 
    id: crypto.randomUUID(),
    tenantId: newTenantId,
    email, 
    password: hashedPassword, 
    role: "client", 
    mustResetPassword: true,
    createdAt: new Date().toISOString()
  });
  db.saveUsers(users);
  
  res.json({ success: true, message: "Client created successfully", tempPassword, tenantId: newTenantId });
});

app.post("/api/auth/login", async (req, res) => {
  let { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: "Credentials required" });
  
  const user = db.users().find(u => u.email === email.toLowerCase().trim());
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ success: false, message: "Invalid credentials" });
  }

  // Enforce Tenant ID existence (migration safety)
  let finalTenantId = user.tenantId;
  if (!finalTenantId) {
    finalTenantId = user.id || crypto.randomUUID();
    const users = db.users(); // Read AFTER await
    const idx = users.findIndex(u => u.email === user.email);
    if (idx !== -1) {
      users[idx].tenantId = finalTenantId;
      db.saveUsers(users);
    }
  }

  const payload = { 
    email: user.email, 
    role: user.role, 
    tenantId: finalTenantId,
    mustResetPassword: user.mustResetPassword || false 
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
  
  res.json({ success: true, token, ...payload });
});

app.post("/api/auth/force-reset", authenticateToken, async (req, res) => {
  let { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ success: false, message: "Password must be 8+ chars" });
  
  const newHash = await bcrypt.hash(newPassword, 10);
  
  const users = db.users(); // Read AFTER await
  const userIndex = users.findIndex(u => u.email === req.user.email);
  if (userIndex === -1) return res.status(404).json({ success: false, message: "User not found" });
  
  users[userIndex].password = newHash;
  users[userIndex].mustResetPassword = false;
  db.saveUsers(users);
  
  const payload = { email: req.user.email, role: users[userIndex].role, tenantId: users[userIndex].tenantId, mustResetPassword: false };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
  res.json({ success: true, message: "Password updated successfully", token, ...payload });
});

// ─── TENANT-ISOLATED BUSINESS LOGIC ─────────────────────────────────────────

app.get("/api/analytics", authenticateToken, (req, res) => {
  const { tenantId, role } = req.user;
  
  // Tenant Isolation: Admin sees all, Client sees only their own.
  const campaigns = db.campaigns().filter(c => role === 'admin' || c.tenantId === tenantId);
  const tracking = db.tracking().filter(t => role === 'admin' || t.tenantId === tenantId);
  
  const analytics = campaigns.map(c => {
    const opens = tracking.filter(t => t.campaignId === c.id && t.event === "open").length;
    return { ...c, opens, openRate: c.sent > 0 ? Math.round((opens / c.sent) * 100) : 0 };
  }).reverse();
  
  res.json({ success: true, analytics });
});

app.post("/api/send-bulk", authenticateToken, upload.fields([{ name: "attachments" }]), async (req, res) => {
  const { tenantId } = req.user;
  const { scheduleTime, ...bodyFields } = req.body;
  const uploadedFiles = req.files?.attachments || [];
  
  const attachmentMap = {};
  for (const file of uploadedFiles) {
    const originalName = file.originalname.replace(/\.pdf$/i, "").trim().toLowerCase();
    const permPath = path.join(ATTACHMENTS_DIR, file.filename + ".pdf");
    fs.renameSync(file.path, permPath);
    attachmentMap[originalName] = permPath;
  }

  const payload = {
    ...bodyFields,
    tenantId, // Inject Tenant Context
    attachments: attachmentMap,
    campaignId: crypto.randomUUID(),
    backendHost: process.env.BACKEND_URL || (req.protocol + '://' + req.get('host'))
  };

  if (scheduleTime) {
    const jobs = db.scheduled();
    jobs.push({ id: crypto.randomUUID(), tenantId, scheduleTime, status: "pending", payload });
    db.saveScheduled(jobs);
    res.json({ success: true, message: "Campaign scheduled", scheduled: true });
  } else {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    await runCampaign(payload, send);
    res.end();
  }
});

// ─── CORE DISPATCH ENGINE ───────────────────────────────────────────────────

const runCampaign = async (payload, sendEvent = () => {}) => {
  const { tenantId, email, password, cc, bcc, subject, bodyWith, bodyWithout, recipients, rateLimit, attachments, campaignId, backendHost } = payload;
  const parsedRecipients = JSON.parse(recipients || "[]");
  
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: email, pass: password },
    pool: true, maxConnections: 3,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });

  const results = [];
  const campaign = {
    id: campaignId,
    tenantId, // Tenant Ownership
    subject: subject,
    date: new Date().toISOString(),
    totalRecipients: parsedRecipients.length,
    sent: 0, failed: 0
  };

  // Enforce Tenant Unsubscribe Isolation
  const unsubscribesList = db.unsubscribes().filter(u => u.tenantId === tenantId).map(u => u.email);

  for (let i = 0; i < parsedRecipients.length; i++) {
    const row = parsedRecipients[i];
    const { to, name, id, templateVars } = row;

    if (!to || !isValidEmail(to)) {
      results.push({ to, status: "invalid", reason: "Bad email" });
      sendEvent({ type: "progress", index: i, total: parsedRecipients.length, to, status: "invalid" });
      continue;
    }

    if (unsubscribesList.includes(to.toLowerCase().trim())) {
      results.push({ to, status: "invalid", reason: "Unsubscribed" });
      sendEvent({ type: "progress", index: i, total: parsedRecipients.length, to, status: "invalid" });
      continue;
    }

    let attachPath = null, attachStatus = "no_pdf";
    const lookupKeys = [id?.toString().toLowerCase().trim(), name?.toString().toLowerCase().trim()].filter(Boolean);
    for (const key of lookupKeys) {
      if (attachments[key]) { attachPath = attachments[key]; attachStatus = "matched"; break; }
    }

    const renderTemplate = (tpl, vars) => tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
    const renderedHtml = renderTemplate(attachPath ? bodyWith : bodyWithout, templateVars);
    
    // Pixel & Unsubscribe Webhooks require Tenant Context
    const pixelUrl = `${backendHost}/api/track/open/${tenantId}/${campaignId}/${encodeURIComponent(to)}`;
    const unsubUrl = `${backendHost}/api/unsubscribe/${tenantId}?email=${encodeURIComponent(to)}`;
    
    const unsubFooter = `<div style="margin-top:40px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;"><p><a href="${unsubUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a></p></div>`;
    const trackedHtml = `${renderedHtml}${unsubFooter}<img src="${pixelUrl}" width="1" height="1" style="display:none;" />`;

    const mailOptions = {
      from: email, to, cc: cc || undefined, bcc: bcc || undefined,
      subject: renderTemplate(subject, templateVars),
      text: renderedHtml.replace(/<[^>]*>?/gm, '') + `\n\nTo unsubscribe, visit: ${unsubUrl}`,
      html: `<div style="font-family:sans-serif;line-height:1.6">${trackedHtml}</div>`,
      attachments: attachPath ? [{ filename: `${id || name || "document"}.pdf`, path: attachPath, contentType: "application/pdf" }] : []
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await transporter.sendMail(mailOptions);
        results.push({ to, status: "sent", attachStatus });
        sendEvent({ type: "progress", index: i, total: parsedRecipients.length, to, status: "sent" });
        break; // success — exit retry loop
      } catch (err) {
        if (attempt === 2) {
          results.push({ to, status: "error", reason: err.message, attachStatus });
          sendEvent({ type: "progress", index: i, total: parsedRecipients.length, to, status: "error" });
        } else {
          await new Promise(r => setTimeout(r, 2000)); // wait before retry
        }
      }
    }
    const delay = parseFloat(rateLimit || 0.4) * 1000;
    if (delay > 0) await new Promise(r => setTimeout(r, delay));
  }

  const campaigns = db.campaigns();
  campaign.sent = results.filter(r => r.status === "sent").length;
  campaign.failed = results.filter(r => r.status === "error").length;
  campaigns.push(campaign);
  db.saveCampaigns(campaigns);
  sendEvent({ type: "done", results });
};

// ─── PUBLIC TRACKING ENDPOINTS ──────────────────────────────────────────────

app.get("/api/track/open/:tenantId/:campaignId/:email", (req, res) => {
  const { tenantId, campaignId, email } = req.params;
  const tracking = db.tracking();
  
  if (!tracking.find(t => t.campaignId === campaignId && t.email === email && t.event === "open")) {
    tracking.push({
      tenantId, campaignId, email, event: "open",
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'] || '',
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
    });
    db.saveTracking(tracking);
  }

  const buf = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  res.writeHead(200, { "Content-Type": "image/gif", "Content-Length": buf.length, "Cache-Control": "no-store, no-cache" });
  res.end(buf);
});

app.get("/api/unsubscribe/:tenantId", (req, res) => {
  const { tenantId } = req.params;
  const email = req.query.email?.toLowerCase().trim();
  if (!email || !tenantId) return res.status(400).send("Invalid request");
  
  const unsubscribes = db.unsubscribes();
  if (!unsubscribes.find(u => u.tenantId === tenantId && u.email === email)) {
    unsubscribes.push({ tenantId, email, createdAt: new Date().toISOString() });
    db.saveUnsubscribes(unsubscribes);
  }
  res.send(`<h2>Successfully Unsubscribed</h2><p>${email} has been removed from this sender's mailing list.</p>`);
});

// Get all clients (Admin only)
app.get("/api/admin/clients", authenticateToken, requireAdmin, (req, res) => {
  const clients = db.users()
    .filter(u => u.role === 'client')
    .map(({ password, ...safe }) => safe); // never expose password hash
  res.json({ success: true, clients });
});

// Update a client
app.put("/api/admin/clients/:id", authenticateToken, requireAdmin, async (req, res) => {
  const users = db.users();
  const index = users.findIndex(u => u.id === req.params.id && u.role === 'client');
  if (index === -1) return res.status(404).json({ success: false, message: "Client not found" });

  const { email, password } = req.body;
  if (email) {
    if (users.find(u => u.email === email && u.id !== req.params.id)) {
      return res.status(400).json({ success: false, message: "Email already in use" });
    }
    users[index].email = email;
  }
  if (password) {
    users[index].password = await bcrypt.hash(password, 10);
    users[index].mustResetPassword = true; // Force them to change it on next login
  }
  
  db.saveUsers(users);
  res.json({ success: true, message: "Client updated successfully" });
});

// Delete a client
app.delete("/api/admin/clients/:id", authenticateToken, requireAdmin, (req, res) => {
  let users = db.users();
  const index = users.findIndex(u => u.id === req.params.id && u.role === 'client');
  if (index === -1) return res.status(404).json({ success: false, message: "Client not found" });

  users.splice(index, 1);
  db.saveUsers(users);
  res.json({ success: true, message: "Client deleted successfully" });
});

// Test SMTP connection
app.post("/api/test-smtp", authenticateToken, async (req, res) => {
  const { email, password, testTo } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: 'SMTP credentials required' });
  try {
    const transporter = nodemailer.createTransport({ 
      host: "smtp.gmail.com", 
      port: 587, 
      secure: false, 
      auth: { user: email, pass: password },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
    await transporter.verify();
    // Send actual test email if testTo is provided
    if (testTo) {
      await transporter.sendMail({
        from: email,
        to: testTo,
        subject: "✅ Deepraj Mail Pro — SMTP Test",
        html: `<div style="font-family:sans-serif;padding:24px;background:#f9fafb;border-radius:12px;max-width:480px">
          <h2 style="color:#2563eb;margin-top:0">Connection Successful!</h2>
          <p style="color:#374151">Your SMTP configuration is working correctly.</p>
          <p style="color:#6b7280;font-size:12px">Sent at ${new Date().toUTCString()}</p>
        </div>`
      });
    }
    res.json({ success: true, message: testTo ? `Test email sent to ${testTo}` : 'Connection verified!' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Background Worker for Scheduled Campaigns
cron.schedule("* * * * *", async () => {
  const jobs = db.scheduled();
  const now = Date.now();
  const jobsToRun = [];

  for (let job of jobs) {
    // Fix: use a dedicated startedAt timestamp for timeout detection, not scheduleTime
    if (job.status === "running") {
      const startedAt = job.startedAt ? new Date(job.startedAt).getTime() : 0;
      if (now - startedAt > 15 * 60000) { // 15 min timeout
        job.status = "failed";
        job.error = "Timeout — worker took too long or crashed";
      }
    }
    if (job.status === "pending" && new Date(job.scheduleTime).getTime() <= now) {
      job.status = "running";
      job.startedAt = new Date().toISOString(); // record when it actually started
      jobsToRun.push(job.id);
    }
  }
  db.saveScheduled(jobs); // Lock jobs immediately

  for (const jobId of jobsToRun) {
    const job = jobs.find(j => j.id === jobId);
    if (!job) continue;
    
    try {
      await runCampaign(job.payload);
      const latestJobs = db.scheduled(); // Re-read
      const latestJobIndex = latestJobs.findIndex(j => j.id === jobId);
      if (latestJobIndex !== -1) {
        latestJobs[latestJobIndex].status = "completed";
        db.saveScheduled(latestJobs);
      }
    } catch (err) {
      const latestJobs = db.scheduled();
      const latestJobIndex = latestJobs.findIndex(j => j.id === jobId);
      if (latestJobIndex !== -1) {
        latestJobs[latestJobIndex].status = "failed";
        latestJobs[latestJobIndex].error = err.message;
        db.saveScheduled(latestJobs);
      }
    }
  }
});

// ─── DEPLOYMENT: SERVE FRONTEND ───────────────────────────────────────────────
const FRONTEND_BUILD_PATH = path.join(__dirname, "../frontend/build");
if (fs.existsSync(FRONTEND_BUILD_PATH)) {
  app.use(express.static(FRONTEND_BUILD_PATH));
  app.get("*", (req, res) => {
    res.sendFile(path.join(FRONTEND_BUILD_PATH, "index.html"));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Enterprise Backend running on port ${PORT}`));
