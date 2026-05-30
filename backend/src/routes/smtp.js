"use strict";

const express = require("express");
const router = express.Router();
const smtpController = require("../controllers/smtpController");
const { authenticateToken } = require("../middleware/auth");

router.post("/save", authenticateToken, smtpController.save);
router.get("/status", authenticateToken, smtpController.status);
router.post("/test", authenticateToken, smtpController.testStored);
router.post("/test-direct", authenticateToken, smtpController.testDirect);
router.delete("/delete", authenticateToken, smtpController.deleteStored);

module.exports = router;
