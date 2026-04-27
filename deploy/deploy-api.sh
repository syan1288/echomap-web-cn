#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_NAME="${SERVICE_NAME:-echomap-api}"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3001}"

echo "[deploy-api] root: ${ROOT_DIR}"
cd "${ROOT_DIR}"

if [ ! -f .env ]; then
  echo "[deploy-api] missing ${ROOT_DIR}/.env"
  echo "[deploy-api] create it from .env.example and fill real API keys first"
  exit 1
fi

echo "[deploy-api] installing dependencies"
npm install

echo "[deploy-api] checking systemd unit"
sudo cp deploy/echomap-api.service.example "/etc/systemd/system/${SERVICE_NAME}.service"
sudo systemctl daemon-reload

echo "[deploy-api] starting ${SERVICE_NAME}"
sudo systemctl enable --now "${SERVICE_NAME}"
sudo systemctl restart "${SERVICE_NAME}"
sudo systemctl --no-pager --full status "${SERVICE_NAME}"

echo "[deploy-api] health check"
curl --fail --silent "http://${HOST}:${PORT}/api/echo-health"
echo
echo "[deploy-api] done"
