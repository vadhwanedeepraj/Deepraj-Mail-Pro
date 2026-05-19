# Stage 1: Build the React Frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Setup the Node.js Backend
FROM node:18-alpine
WORKDIR /app/backend

# Set production environment
ENV NODE_ENV=production

# Copy backend dependencies and install
COPY backend/package*.json ./
RUN npm ci --only=production

# Copy backend source code
COPY backend/ ./

# Copy the built React app from Stage 1 into the frontend/build directory
# (Our server.js is configured to serve from ../frontend/build)
COPY --from=frontend-builder /app/frontend/build /app/frontend/build

# Ensure required persistent directories exist
RUN mkdir -p /app/backend/attachments && chmod 777 /app/backend/attachments

# Expose the API and Web port
EXPOSE 3001

# Start the enterprise backend
CMD ["node", "server.js"]
