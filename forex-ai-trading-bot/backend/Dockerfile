# --- Builder Stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# 1. Copy package files first to leverage Docker cache
COPY package*.json ./

# 2. Install ALL dependencies (including devDependencies) so any build tools work
RUN npm ci

# 3. Copy backend source code
COPY . .

# 4. Prune node_modules down to ONLY production dependencies for the final image
RUN npm prune --production


# --- Runner Stage (Multi-Stage Build) ---
FROM node:20-alpine AS runner

WORKDIR /app

# 5. Set production environment flags
ENV NODE_ENV=production
ENV PORT=5000

# 6. Create a secure non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001

# 7. Copy only what is strictly necessary to run the backend
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src

# 8. Install wget for healthcheck tools
RUN apk add --no-cache wget

# 9. Set permissions so the non-root user can read/execute the files
RUN chown -R appuser:nodejs /app

USER appuser

# Backend exposed port
EXPOSE 5000

# Healthcheck targeting your backend route
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

# Start your Node.js backend server
CMD ["node", "src/server.js"]