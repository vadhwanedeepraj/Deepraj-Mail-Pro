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

router.post("/send-bulk",    sendLimiter, upload.fields([{ name: "attachments" }]), campaignController.sendBulk);
router.post("/send-test",    sendLimiter, campaignController.sendTest);
router.get("/campaigns/active",          apiLimiter, campaignController.getActive);
router.get("/campaigns",                 apiLimiter, campaignController.getCampaigns);
router.get("/campaigns/:id",             apiLimiter, campaignController.getCampaignDetails);
router.post("/campaigns/:id/cancel",     apiLimiter, campaignController.cancel);
router.post("/campaigns/:id/duplicate",  apiLimiter, campaignController.duplicateCampaign);
router.patch("/campaigns/:id/label",     apiLimiter, campaignController.updateCampaignLabel);

module.exports = router;

