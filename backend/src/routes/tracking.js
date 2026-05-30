"use strict";

const express = require("express");
const router = express.Router();
const trackingController = require("../controllers/trackingController");
const { authenticateToken } = require("../middleware/auth");
const { apiLimiter } = require("../middleware/rateLimiter");

// Public endpoints (no auth needed)
router.get("/track/open/:tenantId/:campaignId/:email", trackingController.trackOpen);
router.get("/unsubscribe/:tenantId", trackingController.unsubscribe);

// Protected endpoints (requires auth token)
router.get("/analytics", authenticateToken, apiLimiter, trackingController.getAnalytics);

module.exports = router;
