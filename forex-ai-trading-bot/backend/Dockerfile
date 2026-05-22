FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

RUN addgroup -g 1001 -S nodejs \
  && adduser -S nodejs -u 1001 \
  && mkdir -p /app/logs \
  && chown -R nodejs:nodejs /app/logs

USER nodejs

EXPOSE 5000

CMD ["node", "src/server.js"]
