# ─────────────────────────────────────────────────────────────────────────────
# Deepraj Mail Pro — Production Dockerfile
#
# Multi-stage build:
#   Stage 1 (deps)       — install production-only Node dependencies
#   Stage 2 (production) — minimal runtime image, runs as non-root
#
# Usage:
#   docker build -t deepraj-mail-pro .
#   docker run -p 3001:3001 --env-file backend/.env deepraj-mail-pro
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:18-alpine AS deps

WORKDIR /build

# Copy only manifest files first (leverages Docker layer cache)
COPY backend/package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev --prefer-offline

# ── Stage 2: Production runtime ───────────────────────────────────────────────
FROM node:18-alpine AS production

# Security: run as the built-in non-root 'node' user
USER node

WORKDIR /app

# Copy installed node_modules from the deps stage
COPY --from=deps --chown=node:node /build/node_modules ./node_modules

# Copy backend source (respects .dockerignore — no .env, no logs, no attachments)
COPY --chown=node:node backend/ ./

# Ensure the persistent attachments directory exists with correct ownership
RUN mkdir -p /app/attachments

# Production environment
ENV NODE_ENV=production

# Expose the application port (Render overrides this at runtime via PORT env var)
EXPOSE 3001

# Health check — Render also uses /api/ping as its healthCheckPath
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3001}/api/ping || exit 1

# Start the server
CMD ["node", "server.js"]
