#!/usr/bin/env bash
#
# install.sh — install vps-deployer on any VPS. Idempotent; safe to re-run.
#
# Detects the environment instead of assuming it: ensures the proxy network,
# ADOPTS an already-running Nginx Proxy Manager (connects it to the network),
# generates secrets, builds, installs a systemd service, and opens the firewall.
#
# Override any of these via env before running:
#   PORT                  (default 4500)          port the deployer listens on
#   PROXY_NETWORK         (default prxyman_proxy)  docker network apps + NPM share
#   DEPLOYER_PROXY_DIR    (default /root/prxyman)  dir holding the proxy compose
#   DEPLOYER_APPS_ROOT    (default /root)          where app repos are cloned
#   SERVICE_NAME          (default vps-deployer)   systemd unit name
#
# Usage:  sudo bash install.sh
#
set -euo pipefail

PORT="${PORT:-4500}"
PROXY_NETWORK="${PROXY_NETWORK:-prxyman_proxy}"
DEPLOYER_PROXY_DIR="${DEPLOYER_PROXY_DIR:-/root/prxyman}"
DEPLOYER_APPS_ROOT="${DEPLOYER_APPS_ROOT:-/root}"
SERVICE_NAME="${SERVICE_NAME:-vps-deployer}"
COMPOSE_FILE="$DEPLOYER_PROXY_DIR/docker-compose.yml"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!  %s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo bash install.sh)." >&2; exit 1; }

# --- 1. Prerequisites ----------------------------------------------------
log "Checking prerequisites..."
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but not installed." >&2
  echo "Run the platform bootstrap first:" >&2
  echo "  curl -fsSL https://raw.githubusercontent.com/fpokrzywa/vps_buildout/main/bootstrap.sh | sudo bash" >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "The 'docker compose' v2 plugin is required." >&2; exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  log "Installing Node.js 20 (NodeSource)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
NPM_BIN="$(command -v npm)"
log "node $(node -v), docker $(docker --version | awk '{print $3}' | tr -d ,)"

# --- 2. Proxy network ----------------------------------------------------
if docker network inspect "$PROXY_NETWORK" >/dev/null 2>&1; then
  log "Proxy network '$PROXY_NETWORK' exists."
else
  log "Creating proxy network '$PROXY_NETWORK'..."
  docker network create "$PROXY_NETWORK" >/dev/null
fi

# --- 3. Adopt an existing Nginx Proxy Manager ----------------------------
NPM_CT="$(docker ps --format '{{.Names}}|{{.Image}}' | awk -F'|' '/nginx-proxy-manager/{print $1; exit}')"
if [ -n "$NPM_CT" ]; then
  if docker network connect "$PROXY_NETWORK" "$NPM_CT" 2>/dev/null; then
    log "Adopted existing NPM '$NPM_CT' — connected it to '$PROXY_NETWORK'."
  else
    log "Existing NPM '$NPM_CT' is already on '$PROXY_NETWORK'."
  fi
else
  warn "No running Nginx Proxy Manager found."
  warn "Start one (vps_buildout bootstrap) or add a Proxy Host manually later."
fi

# --- 4. Proxy compose file -----------------------------------------------
mkdir -p "$DEPLOYER_PROXY_DIR"
if [ -f "$COMPOSE_FILE" ]; then
  log "Proxy compose exists: $COMPOSE_FILE (left untouched)."
else
  log "Creating $COMPOSE_FILE (apps will be appended here)..."
  cat > "$COMPOSE_FILE" <<YAML
# Reverse-proxy app stack — managed by vps-deployer.
# App services are appended below as you deploy them.
networks:
  proxy:
    external: true
    name: $PROXY_NETWORK
YAML
fi

# --- 5. Environment / secrets --------------------------------------------
if [ ! -f "$APP_DIR/.env" ]; then
  log "Generating .env (random admin password + session secret)..."
  GEN_PW="$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-16)"
  GEN_SECRET="$(openssl rand -base64 32)"
  {
    echo "ADMIN_PASSWORD=\"$GEN_PW\""
    echo "SESSION_SECRET=\"$GEN_SECRET\""
    echo "PORT=$PORT"
    echo "DEPLOYER_PROXY_NETWORK=\"$PROXY_NETWORK\""
    [ "$DEPLOYER_PROXY_DIR" != "/root/prxyman" ] && echo "DEPLOYER_PROXY_DIR=\"$DEPLOYER_PROXY_DIR\""
    [ "$DEPLOYER_APPS_ROOT" != "/root" ]        && echo "DEPLOYER_APPS_ROOT=\"$DEPLOYER_APPS_ROOT\""
  } > "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  NEW_PW="$GEN_PW"
else
  log ".env already exists — keeping it."
fi

# --- 6. Build ------------------------------------------------------------
log "Installing dependencies + building..."
cd "$APP_DIR"
if [ -f package-lock.json ]; then npm ci; else npm install; fi
npm run build

# --- 7. systemd service --------------------------------------------------
log "Installing systemd service '$SERVICE_NAME'..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<UNIT
[Unit]
Description=VPS Deployer (site deploy/update control panel)
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=$NPM_BIN run start
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=$PORT

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true
systemctl restart "$SERVICE_NAME"
sleep 3

# --- 8. Firewall ---------------------------------------------------------
SUBNET="$(docker network inspect "$PROXY_NETWORK" -f '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null || true)"
GATEWAY="$(docker network inspect "$PROXY_NETWORK" -f '{{range .IPAM.Config}}{{.Gateway}}{{end}}' 2>/dev/null || true)"
if command -v ufw >/dev/null 2>&1 && [ -n "$SUBNET" ]; then
  ufw allow from "$SUBNET" to any port "$PORT" comment "NPM -> $SERVICE_NAME" >/dev/null 2>&1 || true
  log "Firewall: allowed $SUBNET -> port $PORT"
fi

# --- 9. Summary ----------------------------------------------------------
ACTIVE="$(systemctl is-active "$SERVICE_NAME" || true)"
printf '\n\033[1;32mvps-deployer installed.\033[0m  service: %s\n' "$ACTIVE"
cat <<EOF

  Listening   : 0.0.0.0:$PORT   (reachable from NPM at ${GATEWAY:-<gateway>}:$PORT)
  App dir     : $APP_DIR
  Proxy compose: $COMPOSE_FILE
  Manage      : systemctl {status,restart} $SERVICE_NAME  ·  journalctl -u $SERVICE_NAME -f

EOF
if [ -n "${NEW_PW:-}" ]; then
  printf '  Admin password (generated): \033[1m%s\033[0m\n' "$NEW_PW"
  echo "  Change it in $APP_DIR/.env then: systemctl restart $SERVICE_NAME"
else
  echo "  Admin password: see ADMIN_PASSWORD in $APP_DIR/.env"
fi
cat <<EOF

  Expose it: in Nginx Proxy Manager, add a Proxy Host
    Forward Hostname : ${GATEWAY:-<proxy-network-gateway>}
    Forward Port     : $PORT
    SSL              : request a Let's Encrypt cert + Force SSL
EOF
