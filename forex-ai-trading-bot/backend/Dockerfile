FROM node:20-alpine

# Install wget for healthcheck
RUN apk add --no-cache wget

WORKDIR /app

# Step 1: copy only package files (layer cache)
COPY package*.json ./

# Step 2: install production deps only
RUN npm ci --omit=dev

# Step 3: copy source
COPY . .

# Expose backend port
EXPOSE 5000

# Healthcheck — wait for /api/health to respond
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

CMD ["node", "src/server.js"]
