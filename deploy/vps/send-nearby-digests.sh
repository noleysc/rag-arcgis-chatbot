#!/usr/bin/env bash
# Run nearby development digests inside the VPS Compose stack.
# Example cron (daily 9am America/New_York ≈ 14:00 UTC):
#   0 14 * * * /opt/engage-estero/deploy/vps/send-nearby-digests.sh >>/var/log/engage-estero-digests.log 2>&1
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
# shellcheck disable=SC1091
set -a
[ -f .env ] && . ./.env
set +a
docker compose exec -T app python /app/backend/scripts/send_nearby_digests.py "$@"
