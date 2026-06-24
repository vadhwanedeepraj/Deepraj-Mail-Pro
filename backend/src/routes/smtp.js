"use strict";

const express = require("express");
const router = express.Router();
const smtpController = require("../controllers/smtpController");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

// ─── Client / Self Routes (require auth) ─────────────────────────────────────
router.post("/save", authenticateToken, smtpController.save);
router.get("/status", authenticateToken, smtpController.status);
router.post("/test", authenticateToken, smtpController.testStored);
router.post("/test-direct", authenticateToken, smtpController.testDirect);
router.delete("/delete", authenticateToken, smtpController.deleteStored);

// ─── Admin-Only Routes (manage client SMTP) ──────────────────────────────────
router.post("/admin-save/:clientId", authenticateToken, requireAdmin, smtpController.adminSaveSmtp);
router.delete("/admin-delete/:clientId", authenticateToken, requireAdmin, smtpController.adminDeleteSmtp);
router.get("/admin-status/:clientId", authenticateToken, requireAdmin, smtpController.adminGetSmtpStatus);

module.exports = router;
