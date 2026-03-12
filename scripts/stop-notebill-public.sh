#!/usr/bin/env bash
set -euo pipefail

systemctl --user stop notebill-tunnel.service || true
systemctl --user stop notebill-dev.service || true

echo "NoteBill public preview services stopped."
