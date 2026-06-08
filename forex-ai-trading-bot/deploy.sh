#!/bin/bash
set -e

cd /opt/tradingbot/forex-ai-trading-bot

echo "📥 Pulling code..."
git fetch origin
git reset --hard origin/main

echo "🐳 Restarting containers..."
docker compose down
docker compose up -d --build

echo "✅ Deploy done"
