FROM node:20-alpine

WORKDIR /app

# ✅ Step 1: copy only package files
COPY package*.json ./

# ✅ Step 2: install deps (cached)
RUN npm ci --omit=dev

# ✅ Step 3: copy rest code
COPY . .

CMD ["node", "src/server.js"]