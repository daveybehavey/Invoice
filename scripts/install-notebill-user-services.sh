#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/davidheslop/Invoice"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
NODE_BIN="$(command -v node)"
CLOUDFLARED_BIN="$(command -v cloudflared)"
NPM_CLI="$HOME/.nvm/versions/node/v24.12.0/lib/node_modules/npm/bin/npm-cli.js"

if [[ -z "${NODE_BIN}" || -z "${CLOUDFLARED_BIN}" ]]; then
  echo "node or cloudflared binary not found in PATH."
  exit 1
fi

if [[ ! -f "${NPM_CLI}" ]]; then
  echo "npm CLI not found at ${NPM_CLI}"
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
Environment=PATH=/home/davidheslop/.nvm/versions/node/v24.12.0/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=${NODE_BIN} ${NPM_CLI} run start
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
