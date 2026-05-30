"use strict";

const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const { pool } = require("../config/db");
const logger = require("../utils/logger");
const { getActiveCampaigns } = require("./campaignRunner");

const ATTACHMENTS_DIR = path.join(__dirname, "..", "..", "attachments");

/**
 * Initializes the attachment cleanup cron job.
 * Runs daily at 2:00 AM.
 */
function initializeCleanupCron() {
  logger.info("Initializing daily attachment cleanup cron (2:00 AM)...");
  
  cron.schedule("0 2 * * *", async () => {
    logger.info("Starting daily attachment cleanup process...");
    try {
      await performCleanup();
    } catch (err) {
      logger.error("Error during attachment cleanup cron", { error: err.message });
    }
  });
}

/**
 * Scans attachments directory and deletes files older than 24 hours
 * if they are not referenced by any pending/running campaigns.
 */
async function performCleanup() {
  if (!fs.existsSync(ATTACHMENTS_DIR)) {
    return;
  }

  // 1. Gather all active attachment paths in-memory (currently running campaigns)
  const activeCampaigns = getActiveCampaigns();
  const referencedPaths = new Set();

  for (const campaign of activeCampaigns) {
    if (campaign.attachments) {
      Object.values(campaign.attachments).forEach(p => referencedPaths.add(p));
    }
  }

  // 2. Gather all active attachment paths from the scheduled_jobs DB table
  const { rows: scheduledJobs } = await pool.query(
    "SELECT payload FROM scheduled_jobs WHERE status IN ('pending', 'running')"
  );

  for (const job of scheduledJobs) {
    const attachmentsObj = job.payload?.attachments;
    if (attachmentsObj) {
      Object.values(attachmentsObj).forEach(p => referencedPaths.add(p));
    }
  }

  // 3. Scan the files in the attachments directory
  const files = fs.readdirSync(ATTACHMENTS_DIR);
  let deletedCount = 0;
  const now = Date.now();
  const cutoffTime = 24 * 60 * 60 * 1000; // 24 hours in ms

  for (const file of files) {
    const filePath = path.join(ATTACHMENTS_DIR, file);
    
    // Check if the file is in the referenced set
    if (referencedPaths.has(filePath)) {
      continue;
    }

    try {
      const stats = fs.statSync(filePath);
      const ageMs = now - stats.mtimeMs;

      if (ageMs > cutoffTime) {
        fs.unlinkSync(filePath);
        deletedCount++;
        logger.debug(`Deleted old attachment: ${file}`);
      }
    } catch (err) {
      logger.error(`Failed to process or delete file: ${file}`, { error: err.message });
    }
  }

  logger.info(`Attachment cleanup completed. Deleted ${deletedCount} files.`);
}

module.exports = {
  initializeCleanupCron,
  performCleanup
};
