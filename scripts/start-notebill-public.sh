#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "${SCRIPT_DIR}/install-notebill-user-services.sh"

systemctl --user daemon-reload
systemctl --user enable --now notebill-dev.service
systemctl --user enable --now notebill-tunnel.service

echo "NoteBill public preview services started."

for attempt in {1..30}; do
  if curl -fsS http://localhost:3000 >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "Timed out waiting for localhost:3000 to respond."
    exit 1
  fi
  sleep 1
done

for attempt in {1..10}; do
  if npm run check:public-domain; then
    exit 0
  fi
  if [ "$attempt" -eq 10 ]; then
    echo "Public domain readiness did not pass after retries."
    exit 1
  fi
  sleep 2
done
