# OpenClutch Dockerfile
# Multi-stage build for production deployment

# -----------------------------------------------------------------------------
# Stage 1: Dependencies
# -----------------------------------------------------------------------------
FROM node:22-alpine AS deps

# Install pnpm
RUN npm install -g pnpm@10.28.2

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Stage 2: Builder
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder

# Install pnpm
RUN npm install -g pnpm@10.28.2

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build the Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN pnpm build

# -----------------------------------------------------------------------------
# Stage 3: Runtime
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runtime

# Install pnpm and tsx for running worker scripts
RUN npm install -g pnpm@10.28.2 tsx@4.21.0

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy necessary files from builder
# Standalone output puts everything in .next/standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy static files (for standalone output, these need to be copied separately)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy worker scripts and dependencies (needed for worker processes)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/worker ./worker
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/bin ./bin
COPY --from=builder --chown=nextjs:nodejs /app/convex ./convex
COPY --from=builder --chown=nextjs:nodejs /app/hooks ./hooks
COPY --from=builder --chown=nextjs:nodejs /app/plugins ./plugins
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts

# Switch to non-root user
USER nextjs

# Expose the port the app runs on
EXPOSE 3002

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3002
ENV HOSTNAME="0.0.0.0"

# Default command (can be overridden in docker-compose)
CMD ["node", "server.js"]
