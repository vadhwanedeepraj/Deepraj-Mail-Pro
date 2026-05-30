"use strict";

const { Pool } = require("pg");
const { DATABASE_URL, IS_PRODUCTION } = require("./env");
const logger = require("../utils/logger");

/**
 * PostgreSQL connection pool.
 *
 * Render free tier PostgreSQL allows max 25 connections. We cap at 5
 * to leave headroom for Render's internal monitoring + multiple dyno restarts.
 *
 * SSL is required for Render PostgreSQL in production.
 */
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: IS_PRODUCTION ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  logger.error("Unexpected PostgreSQL pool error", { error: err.message });
});

pool.on("connect", () => {
  logger.info("PostgreSQL: new client connected to pool");
});

/**
 * Execute a single parameterized query.
 * @param {string} text - SQL query string with $1, $2 placeholders
 * @param {Array}  params - Query parameters
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 500) {
      logger.warn("Slow query detected", { duration, query: text.slice(0, 80) });
    }
    return result;
  } catch (err) {
    logger.error("PostgreSQL query error", {
      error: err.message,
      query: text.slice(0, 80),
    });
    throw err;
  }
}

/**
 * Execute a function inside a transaction.
 * Automatically commits on success, rolls back on error.
 * @param {Function} fn - Async function that receives (client) and runs queries
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Test the database connection.
 * Called during server startup — crashes the process if DB is unreachable.
 */
async function testConnection() {
  try {
    const result = await pool.query("SELECT NOW() AS now");
    logger.info("✅ PostgreSQL connected", { time: result.rows[0].now });
  } catch (err) {
    logger.error("🚨 Cannot connect to PostgreSQL. Check DATABASE_URL.", {
      error: err.message,
    });
    process.exit(1);
  }
}

module.exports = { query, withTransaction, testConnection, pool };
