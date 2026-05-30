"use strict";

const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

// All admin routes require token authentication and admin permissions
router.use(authenticateToken);
router.use(requireAdmin);

router.post("/clients", adminController.createClient);
router.get("/clients", adminController.getClients);
router.put("/clients/:id/status", adminController.updateClientStatus);
router.put("/clients/:id/quota", adminController.updateClientQuota);
router.put("/clients/:id/password", adminController.updateClientPassword);
router.delete("/clients/:id", adminController.deleteClient);

router.get("/active-campaigns", adminController.getActiveCampaigns);
router.post("/campaigns/:id/cancel", adminController.cancelCampaign);

module.exports = router;
