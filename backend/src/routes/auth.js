"use strict";

const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { authenticateToken } = require("../middleware/auth");
const { loginLimiter } = require("../middleware/rateLimiter");

router.post("/login", loginLimiter, authController.login);
router.post("/force-reset", authenticateToken, authController.forceReset);

module.exports = router;
