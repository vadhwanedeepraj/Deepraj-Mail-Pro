# DEPRECATED — This backend-only Dockerfile is NOT used.
#
# ISSUE-02 Fix: The canonical Docker build is the ROOT-LEVEL Dockerfile
# at the repo root (Deepraj Mail Pro/Dockerfile), which:
#   1. Builds the React frontend (Stage 1)
#   2. Sets up the Node.js backend (Stage 2)
#   3. Serves the frontend static files from the backend
#
# This file previously caused confusion and had bugs:
#   - Exposed port 3001 but the app binds to process.env.PORT (Render uses 10000)
#   - Used deprecated --only=production flag (use --omit=dev instead)
#   - Did NOT copy the frontend build, so the unified server couldn't serve the SPA
#
# render.yaml correctly references: dockerfilePath: ./Dockerfile (the root one)
# docker-compose.yml correctly builds from: context: . dockerfile: Dockerfile
#
# TODO: Delete this file to eliminate the ambiguity.

FROM scratch
# This Dockerfile intentionally does nothing.
# Use the root Dockerfile instead.
