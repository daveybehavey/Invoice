#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
NODE_BIN="$(command -v node)"
NODE_DIR="$(dirname "${NODE_BIN}")"
CLOUDFLARED_BIN="$(command -v cloudflared)"
NPM_BIN="$(command -v npm)"

if [[ -z "${NODE_BIN}" || -z "${NPM_BIN}" || -z "${CLOUDFLARED_BIN}" ]]; then
  echo "node, npm, or cloudflared binary not found in PATH."
  exit 1
fi

if [[ ! -x "${NPM_BIN}" ]]; then
  echo "npm binary is not executable at ${NPM_BIN}"
  exit 1
fi

mkdir -p "${SYSTEMD_USER_DIR}"

cat > "${SYSTEMD_USER_DIR}/notebill-dev.service" <<UNIT
[Unit]
Description=NoteBill local app server
After=network.target

[Service]
Type=simple
WorkingDirectory=${ROOT_DIR}
Environment=NODE_ENV=production
Environment=PATH=${NODE_DIR}:/usr/local/bin:/usr/bin:/bin
ExecStart=${NPM_BIN} run start
Restart=always
RestartSec=2

[Install]
WantedBy=default.target
UNIT

cat > "${SYSTEMD_USER_DIR}/notebill-tunnel.service" <<UNIT
[Unit]
Description=NoteBill Cloudflare Tunnel
After=network-online.target notebill-dev.service
Wants=network-online.target notebill-dev.service

[Service]
Type=simple
ExecStart=${CLOUDFLARED_BIN} tunnel run notebill-app
Restart=always
RestartSec=2

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
echo "Installed user services:"
echo "- ${SYSTEMD_USER_DIR}/notebill-dev.service"
echo "- ${SYSTEMD_USER_DIR}/notebill-tunnel.service"
