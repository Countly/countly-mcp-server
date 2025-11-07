# Multi-stage Dockerfile for Countly MCP Server
# Optimized for production use with minimal image size

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY tsconfig.build.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy built files from builder stage
COPY --from=builder /app/build ./build

# Copy other necessary files
COPY --chown=nodejs:nodejs .env.example ./.env.example

# Create directory for token files (useful for Docker secrets)
RUN mkdir -p /run/secrets && \
    chown -R nodejs:nodejs /run/secrets

# Switch to non-root user
USER nodejs

# Environment variables (can be overridden)
ENV NODE_ENV=production \
    COUNTLY_SERVER_URL=https://api.count.ly \
    COUNTLY_TIMEOUT=30000

# Expose port for HTTP mode
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Default command: run in HTTP mode (can be overridden for stdio mode)
CMD ["node", "build/index.js", "--http"]
