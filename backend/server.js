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
const logger = require("./logger");
const { getQueue, initializeQueueWorker, queueEvents } = require("./queue");

const app = express();
const upload = multer({ dest: os.tmpdir() });

// Global active campaign trackers
const activeCampaigns = new Map();
const activeCancellations = new Set();

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

// ─── HEALTH CHECK (keep-alive for Render free tier) ──────────────────────────
app.get("/api/ping", (req, res) => res.json({ ok: true, ts: Date.now() }));


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
    isSuspended: false,
    dailyQuota: 200,
    sentToday: 0,
    lastSentDate: new Date().toISOString().slice(0, 10),
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

  // Reject login if suspended
  if (user.isSuspended) {
    return res.status(403).json({ success: false, message: "Your account has been suspended. Please contact the Administrator." });
  }

  // Enforce Tenant ID existence & quota fields (migration safety)
  let finalTenantId = user.tenantId;
  let mustSave = false;
  if (!finalTenantId) {
    finalTenantId = user.id || crypto.randomUUID();
    user.tenantId = finalTenantId;
    mustSave = true;
  }
  if (user.isSuspended === undefined) {
    user.isSuspended = false;
    mustSave = true;
  }
  if (user.dailyQuota === undefined) {
    user.dailyQuota = 200;
    mustSave = true;
  }
  if (user.sentToday === undefined) {
    user.sentToday = 0;
    mustSave = true;
  }
  if (user.lastSentDate === undefined) {
    user.lastSentDate = new Date().toISOString().slice(0, 10);
    mustSave = true;
  }

  if (mustSave) {
    const users = db.users(); // Read AFTER await
    const idx = users.findIndex(u => u.email === user.email);
    if (idx !== -1) {
      users[idx].tenantId = finalTenantId;
      users[idx].isSuspended = user.isSuspended;
      users[idx].dailyQuota = user.dailyQuota;
      users[idx].sentToday = user.sentToday;
      users[idx].lastSentDate = user.lastSentDate;
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
  const { tenantId, role } = req.user;
  const { scheduleTime, ...bodyFields } = req.body;
  const uploadedFiles = req.files?.attachments || [];
  
  // Quota Verification for non-admins
  if (role !== 'admin') {
    const users = db.users();
    const client = users.find(u => u.tenantId === tenantId);
    if (client) {
      const todayStr = new Date().toISOString().slice(0, 10);
      let sentToday = client.sentToday || 0;
      if (client.lastSentDate !== todayStr) {
        sentToday = 0;
      }
      
      const recipients = JSON.parse(req.body.recipients || "[]");
      const dailyQuota = client.dailyQuota !== undefined ? client.dailyQuota : 200;
      
      if (sentToday + recipients.length > dailyQuota) {
        return res.status(400).json({ 
          success: false, 
          message: `Daily sending quota exceeded. You have sent ${sentToday}/${dailyQuota} emails today. This campaign has ${recipients.length} recipients, exceeding your remaining quota.` 
        });
      }
    }
  }
  
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
    tenantId, // Inject Tenant Context
    attachments: attachmentMap,
    campaignId,
    backendHost: process.env.BACKEND_URL || (req.protocol + '://' + req.get('host'))
  };

  if (scheduleTime) {
    const jobs = db.scheduled();
    jobs.push({ id: crypto.randomUUID(), tenantId, scheduleTime, status: "pending", payload });
    db.saveScheduled(jobs);
    logger.info("Campaign scheduled successfully", { campaignId, tenantId, scheduleTime });
    res.json({ success: true, message: "Campaign scheduled", scheduled: true });
  } else {
    logger.info("Queueing immediate campaign dispatch", { campaignId, tenantId });

    // ── Send SSE headers immediately so the browser opens the stream ──
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx/Render proxy buffering
    res.flushHeaders();

    // ── Keepalive: ping every 20s so Render's 55s proxy timeout never fires ──
    const keepAlive = setInterval(() => {
      try { res.write(": keepalive\n\n"); } catch (_) { /* stream already closed */ }
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
      try { res.write(`data: ${JSON.stringify({ type: "progress", status: "error", reason: data.error })}\n\n`); } catch (_) {}
      cleanup();
      res.end();
    };

    queueEvents.on(`progress:${campaignId}`, onProgress);
    queueEvents.on(`done:${campaignId}`, onDone);
    queueEvents.on(`error:${campaignId}`, onError);

    // Handle client disconnecting mid-campaign (browser tab closed, etc.)
    res.on("close", () => {
      logger.info("SSE client disconnected mid-campaign", { campaignId });
      cleanup();
    });

    // Add to email queue AFTER headers are sent
    const emailQueue = getQueue();
    await emailQueue.add("send-campaign", payload);
  }
});

// ─── CORE DISPATCH ENGINE ───────────────────────────────────────────────────

const runCampaign = async (payload, sendEvent = () => {}) => {
  const { tenantId, email, password, cc, bcc, subject, bodyWith, bodyWithout, recipients, rateLimit, attachments, campaignId, backendHost } = payload;
  const parsedRecipients = JSON.parse(recipients || "[]");
  
  const VERCEL_PROXY_URL = "https://email-proxy-one.vercel.app/api/send";

  // Register in activeCampaigns tracking
  activeCampaigns.set(campaignId, { campaignId, tenantId, email, subject, progress: 0, total: parsedRecipients.length, currentEmail: "", status: "sending" });

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

    // Check if campaign was aborted by Admin
    if (activeCancellations.has(campaignId)) {
      logger.warn(`Campaign ${campaignId} cancelled by Admin mid-dispatch`);
      results.push({ to: "—", status: "cancelled", reason: "Cancelled by Administrator" });
      sendEvent({ type: "progress", index: i, total: parsedRecipients.length, to: "—", status: "cancelled" });
      break;
    }

    // Update activeCampaign progress details
    if (activeCampaigns.has(campaignId)) {
      const activeObj = activeCampaigns.get(campaignId);
      activeObj.progress = i;
      activeObj.currentEmail = to;
    }

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

    const payloadToProxy = {
      email, password,
      to, cc: cc || undefined, bcc: bcc || undefined,
      subject: renderTemplate(subject, templateVars),
      text: renderedHtml.replace(/<[^>]*>?/gm, '') + `\n\nTo unsubscribe, visit: ${unsubUrl}`,
      html: `<div style="font-family:sans-serif;line-height:1.6">${trackedHtml}</div>`,
    };

    if (attachPath) {
      try {
        const fileContent = fs.readFileSync(attachPath, { encoding: 'base64' });
        payloadToProxy.attachments = [{
          filename: `${id || name || "document"}.pdf`,
          content: fileContent
        }];
      } catch (e) {}
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(VERCEL_PROXY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadToProxy)
        });
        
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error(json.message || "Proxy relay failed");

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
    // Minimum 0.5s delay to respect user's rate-limit setting; Gmail safe floor is 0.5s
    const delay = Math.max(parseFloat(rateLimit || 1), 0.5) * 1000;
    await new Promise(r => setTimeout(r, delay));
  }

  // Clean active states
  activeCampaigns.delete(campaignId);
  activeCancellations.delete(campaignId);

  // Update client sent count limit
  const users = db.users();
  const clientIdx = users.findIndex(u => u.tenantId === tenantId);
  if (clientIdx !== -1 && users[clientIdx].role !== 'admin') {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (users[clientIdx].lastSentDate !== todayStr) {
      users[clientIdx].sentToday = 0;
      users[clientIdx].lastSentDate = todayStr;
    }
    users[clientIdx].sentToday += results.filter(r => r.status === "sent").length;
    db.saveUsers(users);
  }

  const campaigns = db.campaigns();
  campaign.sent = results.filter(r => r.status === "sent").length;
  campaign.failed = results.filter(r => r.status === "error").length;
  campaign.results = results; // Store full audit log
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

// Toggle client suspended status (Admin only)
app.put("/api/admin/clients/:id/status", authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { isSuspended } = req.body;
  
  const users = db.users();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Client not found" });
  
  users[idx].isSuspended = !!isSuspended;
  db.saveUsers(users);
  
  logger.info(`Admin updated client status`, { clientEmail: users[idx].email, isSuspended });
  res.json({ success: true, message: `Client status updated successfully`, isSuspended: users[idx].isSuspended });
});

// Update client daily quota limit (Admin only)
app.put("/api/admin/clients/:id/quota", authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { dailyQuota } = req.body;
  
  const limit = parseInt(dailyQuota, 10);
  if (isNaN(limit) || limit < 0) return res.status(400).json({ success: false, message: "Invalid daily quota" });
  
  const users = db.users();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Client not found" });
  
  users[idx].dailyQuota = limit;
  db.saveUsers(users);
  
  logger.info(`Admin updated client daily quota`, { clientEmail: users[idx].email, dailyQuota: limit });
  res.json({ success: true, message: `Client daily quota updated successfully`, dailyQuota: limit });
});

// Reset client password directly (Admin only)
app.put("/api/admin/clients/:id/password", authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  
  if (!password || password.length < 8) {
    return res.status(400).json({ success: false, message: "Password must be at least 8 characters long." });
  }
  
  const users = db.users();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Client not found" });
  
  const hashedPassword = await bcrypt.hash(password, 10);
  users[idx].password = hashedPassword;
  users[idx].mustResetPassword = false; // Override forces no forced reset needed since Admin did it
  db.saveUsers(users);
  
  logger.info(`Admin reset client password`, { clientEmail: users[idx].email });
  res.json({ success: true, message: "Client password updated successfully" });
});

// Delete client account completely (Admin only)
app.delete("/api/admin/clients/:id", authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  
  const users = db.users();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Client not found" });
  
  const clientEmail = users[idx].email;
  const tenantId = users[idx].tenantId;
  
  // Remove user
  users.splice(idx, 1);
  db.saveUsers(users);
  
  // Cascade clean campaigns & tracking logs for this tenant (optional but very clean!)
  const campaigns = db.campaigns().filter(c => c.tenantId !== tenantId);
  db.saveCampaigns(campaigns);
  
  const tracking = db.tracking().filter(t => t.tenantId !== tenantId);
  db.saveTracking(tracking);
  
  const scheduled = db.scheduled().filter(s => s.tenantId !== tenantId);
  db.saveScheduled(scheduled);
  
  const unsubscribes = db.unsubscribes().filter(u => u.tenantId !== tenantId);
  db.saveUnsubscribes(unsubscribes);
  
  logger.info(`Admin deleted client account and cascade wiped data`, { clientEmail });
  res.json({ success: true, message: `Client account deleted successfully` });
});

// Fetch all active email dispatches (Admin only)
app.get("/api/admin/active-campaigns", authenticateToken, requireAdmin, (req, res) => {
  res.json({ success: true, activeCampaigns: Array.from(activeCampaigns.values()) });
});

// Cancel a running email dispatch loop (Admin only)
app.post("/api/admin/campaigns/:id/cancel", authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  activeCancellations.add(id);
  logger.warn(`Admin requested cancellation of campaign`, { campaignId: id });
  res.json({ success: true, message: "Cancellation request received" });
});

// Test SMTP connection
app.post("/api/test-smtp", authenticateToken, async (req, res) => {
  const { email, password, testTo } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: 'SMTP credentials required' });
  try {
    const VERCEL_PROXY_URL = "https://email-proxy-one.vercel.app/api/send";
    
    const response = await fetch(VERCEL_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, verifyOnly: true })
    });
    
    const json = await response.json();
    if (!response.ok || !json.success) throw new Error(json.message || "Connection failed");

    // Send actual test email if testTo is provided
    if (testTo) {
      const sendRes = await fetch(VERCEL_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, password, to: testTo,
          subject: "✅ Deepraj Mail Pro — SMTP Test",
          html: `<div style="font-family:sans-serif;padding:24px;background:#f9fafb;border-radius:12px;max-width:480px">
            <h2 style="color:#2563eb;margin-top:0">Connection Successful!</h2>
            <p style="color:#374151">Your Render Server successfully bypassed the firewall via Vercel.</p>
            <p style="color:#6b7280;font-size:12px">Sent at ${new Date().toUTCString()}</p>
          </div>`
        })
      });
      const sendJson = await sendRes.json();
      if (!sendRes.ok || !sendJson.success) throw new Error(sendJson.message || "Proxy test email relay failed");
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
    if (job.status === "running") {
      const startedAt = job.startedAt ? new Date(job.startedAt).getTime() : 0;
      if (now - startedAt > 15 * 60000) { // 15 min timeout
        job.status = "failed";
        job.error = "Timeout — worker took too long or crashed";
        logger.error("Scheduled campaign timeout detected", { jobId: job.id });
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
      logger.info("Queuing scheduled campaign for background execution", { jobId, campaignId: job.payload.campaignId });
      const emailQueue = getQueue();
      await emailQueue.add("send-campaign", {
        ...job.payload,
        scheduledJobId: job.id
      });
    } catch (err) {
      logger.error("Failed to queue scheduled campaign", { jobId, error: err.message });
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

// Initialize Queue Worker
initializeQueueWorker(async (job) => {
  const { campaignId, scheduledJobId } = job.data;
  logger.info("Queue Worker processing email dispatch campaign", { campaignId });
  
  const sendEvent = (data) => {
    if (data.type === "progress") {
      queueEvents.emit(`progress:${campaignId}`, data);
    } else if (data.type === "done") {
      queueEvents.emit(`done:${campaignId}`, data);
      
      // If it was a scheduled campaign, mark it as completed
      if (scheduledJobId) {
        const latestJobs = db.scheduled();
        const idx = latestJobs.findIndex(j => j.id === scheduledJobId);
        if (idx !== -1) {
          latestJobs[idx].status = "completed";
          db.saveScheduled(latestJobs);
          logger.info("Successfully updated scheduled job state to completed", { scheduledJobId });
        }
      }
    }
  };

  try {
    await runCampaign(job.data, sendEvent);
    logger.info("Queue Worker successfully completed email dispatch campaign", { campaignId });
  } catch (err) {
    logger.error("Queue Worker campaign execution failed", { campaignId, error: err.message });
    queueEvents.emit(`error:${campaignId}`, { error: err.message });
    
    // If it was a scheduled campaign, mark it as failed
    if (scheduledJobId) {
      const latestJobs = db.scheduled();
      const idx = latestJobs.findIndex(j => j.id === scheduledJobId);
      if (idx !== -1) {
        latestJobs[idx].status = "failed";
        latestJobs[idx].error = err.message;
        db.saveScheduled(latestJobs);
        logger.info("Updated scheduled job state to failed", { scheduledJobId, error: err.message });
      }
    }
    throw err;
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
app.listen(PORT, () => logger.info(`Enterprise Backend running on port ${PORT}`));
