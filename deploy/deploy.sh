#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# IO Builds — one-shot deploy script for the VPS
# -----------------------------------------------------------------------------
# Pulls latest code, rebuilds the frontend image, and restarts it.
# Run from the project root on the VPS:    ./deploy/deploy.sh
# -----------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "❌  .env not found. Copy .env.example to .env and fill it in."
  exit 1
fi

echo "▶ Pulling latest code…"
git pull --ff-only

echo "▶ Building frontend image…"
docker compose build --pull

echo "▶ Restarting frontend…"
docker compose up -d

echo "▶ Pruning dangling images…"
docker image prune -f >/dev/null

echo "✅  Deploy complete. Frontend is running on http://127.0.0.1:8080"
echo "    (Make sure host Nginx is pointing at it — see deploy/nginx/host-site.conf.example)"
