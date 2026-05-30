"use strict";

const express = require("express");
const router = express.Router();
const multer = require("multer");
const os = require("os");
const campaignController = require("../controllers/campaignController");
const { authenticateToken } = require("../middleware/auth");
const { apiLimiter, sendLimiter } = require("../middleware/rateLimiter");

// Multer upload config for handling temporary attachments
const upload = multer({ dest: os.tmpdir() });

router.use(authenticateToken);

router.post("/send-bulk", sendLimiter, upload.fields([{ name: "attachments" }]), campaignController.sendBulk);
router.get("/campaigns", apiLimiter, campaignController.getCampaigns);
router.get("/campaigns/:id", apiLimiter, campaignController.getCampaignDetails);

module.exports = router;
