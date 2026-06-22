// All environment-specific settings live here, driven by env vars with defaults
// that match the original VPS. Override any of them in .env to install on a
// differently-laid-out box.

export const APPS_ROOT = process.env.DEPLOYER_APPS_ROOT || "/root";
export const PROXY_DIR = process.env.DEPLOYER_PROXY_DIR || "/root/prxyman";
export const COMPOSE_PATH =
  process.env.DEPLOYER_COMPOSE_PATH || `${PROXY_DIR}/docker-compose.yml`;
export const FLUTTER_BIN = process.env.DEPLOYER_FLUTTER_BIN || "/root/flutter/bin";
export const PORT = process.env.PORT || "4500";

// The docker network apps + NPM share (used only for the dashboard binding panel;
// the compose file is the source of truth for what apps actually join).
export const PROXY_NETWORK = process.env.DEPLOYER_PROXY_NETWORK || "prxyman_proxy";

// Compose services that are infrastructure, not deployable sites.
export const INFRA_SERVICES = (process.env.DEPLOYER_INFRA_SERVICES || "npm,oauth2-proxy")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
