const { Queue, Worker } = require("bullmq");
const IORedis = require("ioredis");
const EventEmitter = require("events");
const logger = require("./logger");

// ─── REDIS CONFIG ─────────────────────────────────────────────────────────────
// Render provides REDIS_URL as a full connection string.
// Locally, we fall back to host+port.
const REDIS_URL  = process.env.REDIS_URL  || null;
const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);

// ─── SHARED STATE ─────────────────────────────────────────────────────────────
const queueEvents = new EventEmitter();
queueEvents.setMaxListeners(200); // many campaigns can listen at once

let emailQueue      = null; // set once Redis connects (or to fallback)
let bullmqWorker    = null; // created once
let isRedisOK       = false; // true only after successful Redis connect
let redisConnection = null;

// ─── IN-MEMORY FALLBACK (local dev without Redis) ────────────────────────────
const localJobsQueue      = [];
let   localWorkerActive   = false;
let   localProcessHandler = null;
let   fallbackReady       = false; // true once fallback queue is set up

const runLocalWorker = async () => {
  if (localWorkerActive || localJobsQueue.length === 0 || !localProcessHandler) return;
  localWorkerActive = true;
  while (localJobsQueue.length > 0) {
    const job = localJobsQueue.shift();
    logger.info("Local queue: processing job", { jobId: job.id, campaignId: job.data.campaignId });
    try {
      await localProcessHandler(job);
      logger.info("Local queue: job complete", { jobId: job.id });
    } catch (err) {
      logger.error("Local queue: job failed", { jobId: job.id, error: err.message });
    }
  }
  localWorkerActive = false;
};

const makeFallbackQueue = () => ({
  add: async (name, data) => {
    const jobId = Math.random().toString(36).slice(2, 9);
    const job   = { id: jobId, name, data };
    localJobsQueue.push(job);
    logger.info("Local queue: job enqueued", { jobId, campaignId: data.campaignId });
    setImmediate(runLocalWorker);
    return job;
  }
});

// ─── REDIS CONNECTION ─────────────────────────────────────────────────────────
const redisOpts = REDIS_URL
  ? { 
      maxRetriesPerRequest: null, 
      connectTimeout: 8000, 
      enableReadyCheck: false,
      retryStrategy(times) {
        if (times > 3) {
          logger.info("Redis connection attempts exceeded limit. Using fallback.");
          return null; // Stop retrying
        }
        return Math.min(times * 100, 2000);
      }
    }
  : { 
      host: REDIS_HOST, 
      port: REDIS_PORT, 
      maxRetriesPerRequest: null, 
      connectTimeout: 3000, 
      enableReadyCheck: false,
      retryStrategy(times) {
        if (times > 3) {
          logger.info("Local Redis connection attempts exceeded limit. Using in-memory fallback.");
          return null; // Stop retrying
        }
        return Math.min(times * 100, 1000);
      }
    };

logger.info("Attempting Redis connection...", REDIS_URL ? { via: "REDIS_URL" } : { host: REDIS_HOST, port: REDIS_PORT });

redisConnection = REDIS_URL
  ? new IORedis(REDIS_URL, redisOpts)
  : new IORedis(redisOpts);

// ─── ON REDIS READY ───────────────────────────────────────────────────────────
redisConnection.on("connect", () => {
  if (isRedisOK) return; // already handled
  isRedisOK = true;
  logger.info("✅ Redis connected — initialising BullMQ Queue");

  emailQueue = new Queue("email-dispatch", { connection: redisConnection });

  // If initializeQueueWorker() was already called before Redis connected,
  // we need to start the BullMQ Worker now (deferred start).
  if (localProcessHandler && !bullmqWorker) {
    logger.info("Redis now ready — starting deferred BullMQ Worker");
    _startBullMQWorker(localProcessHandler);
  }
});

// ─── ON REDIS ERROR (triggers fallback) ──────────────────────────────────────
let fallbackLogged = false;
redisConnection.on("error", (err) => {
  if (isRedisOK || fallbackLogged) return;
  fallbackLogged = true;
  logger.warn("⚠️  Redis unavailable — using in-memory fallback queue", { error: err.message });

  if (!fallbackReady) {
    fallbackReady = true;
    emailQueue = makeFallbackQueue();
    // If worker was already registered, kick off any pending local jobs
    if (localProcessHandler) setImmediate(runLocalWorker);
  }
});

// ─── BULLMQ WORKER (only used when Redis is available) ───────────────────────
const _startBullMQWorker = (processHandler) => {
  if (bullmqWorker) return; // idempotent

  logger.info("Starting BullMQ Worker (concurrency=1)");

  const workerConn = REDIS_URL
    ? new IORedis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false })
    : new IORedis({ host: REDIS_HOST, port: REDIS_PORT, maxRetriesPerRequest: null, enableReadyCheck: false });

  bullmqWorker = new Worker(
    "email-dispatch",
    async (job) => {
      logger.info("BullMQ Worker: picked up job", { jobId: job.id, campaignId: job.data.campaignId });
      return await processHandler(job);
    },
    { connection: workerConn, concurrency: 1 }
  );

  bullmqWorker.on("completed", (job) =>
    logger.info("BullMQ Worker: job completed", { jobId: job.id, campaignId: job.data.campaignId })
  );
  bullmqWorker.on("failed", (job, err) =>
    logger.error("BullMQ Worker: job failed", { jobId: job?.id, error: err.message })
  );
};

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Called from server.js once at startup to register the campaign processor.
 * Safe to call before Redis has connected — deferred start handles that case.
 */
const initializeQueueWorker = (processHandler) => {
  localProcessHandler = processHandler; // always store

  if (isRedisOK) {
    // Redis already up before this call (unlikely but handle it)
    _startBullMQWorker(processHandler);
  } else if (fallbackReady) {
    // Fallback already active, start local worker
    setImmediate(runLocalWorker);
  } else {
    // Neither Redis nor fallback ready yet.
    // Provide a temporary in-memory queue so calls to getQueue().add() don't
    // crash with "Cannot read properties of null".  When Redis connects, the
    // "connect" handler above will replace emailQueue with BullMQ and start
    // the real worker; those early local jobs will still run via runLocalWorker.
    if (!emailQueue) {
      fallbackReady = true;
      emailQueue    = makeFallbackQueue();
      logger.info("Pre-connect fallback queue active — will upgrade to BullMQ when Redis connects");
    }
    logger.info("Worker registration deferred — waiting for Redis...");
  }
};

/**
 * Always returns a usable queue object (never null after initializeQueueWorker).
 */
const getQueue = () => {
  if (!emailQueue) {
    // Safety net: should not reach here after initializeQueueWorker is called,
    // but avoid crashing.
    logger.warn("getQueue() called before queue was ready — returning transient fallback");
    emailQueue = makeFallbackQueue();
  }
  return emailQueue;
};

module.exports = { getQueue, initializeQueueWorker, queueEvents };
