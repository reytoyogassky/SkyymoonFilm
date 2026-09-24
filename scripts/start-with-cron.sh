#!/bin/sh
set -e

echo "[$(date)] Starting auto-scraper in background..."
node /app/scripts/cron-scrape.js &

echo "[$(date)] Starting Next.js server..."
exec node server.js
