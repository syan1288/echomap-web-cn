#!/usr/bin/env bash

set -euo pipefail

APP_NAME="${APP_NAME:-echomap-web-cn}"
IMAGE_NAME="${IMAGE_NAME:-echomap-web-cn}"
PORT="${PORT:-8080}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "[deploy] building ${IMAGE_NAME} from ${ROOT_DIR}"
cd "${ROOT_DIR}"
docker build -t "${IMAGE_NAME}" .

if docker ps -a --format '{{.Names}}' | grep -Fxq "${APP_NAME}"; then
  echo "[deploy] removing existing container ${APP_NAME}"
  docker rm -f "${APP_NAME}" >/dev/null
fi

echo "[deploy] starting ${APP_NAME} on 127.0.0.1:${PORT}"
docker run -d \
  --name "${APP_NAME}" \
  --restart unless-stopped \
  -p "127.0.0.1:${PORT}:80" \
  "${IMAGE_NAME}"

echo "[deploy] done"
echo "[deploy] frontend container: http://127.0.0.1:${PORT}"
echo "[deploy] next step: configure nginx to proxy your domain to 127.0.0.1:${PORT}"
