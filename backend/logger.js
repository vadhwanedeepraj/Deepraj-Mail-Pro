/**
 * DEPRECATED — This file is a backward-compatibility shim.
 *
 * The canonical logger is at: backend/src/utils/logger.js
 *
 * This root-level file previously caused a startup crash on fresh Docker/Render
 * deployments because it called fs.mkdirSync() without { recursive: true },
 * throwing ENOENT if the logs/ directory didn't exist.
 *
 * ISSUE-01 Fix: queue.js now imports from ./src/utils/logger directly.
 * This file is kept only to avoid breaking any external tools that might
 * reference it. It simply re-exports the correct logger.
 *
 * TODO: Delete this file once confirmed nothing else imports it.
 */
module.exports = require("./src/utils/logger");
