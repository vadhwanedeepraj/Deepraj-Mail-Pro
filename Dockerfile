FROM node:18-slim
WORKDIR /app/backend

# Set production environment
ENV NODE_ENV=production

# Copy backend dependencies and install
COPY backend/package*.json ./
RUN npm install --omit=dev

# Copy backend source code
COPY backend/ ./

# Ensure required persistent directories exist
RUN mkdir -p /app/backend/attachments && chmod 777 /app/backend/attachments

# Expose the API and Web port
EXPOSE 3001

# Start the backend server
CMD ["node", "server.js"]
