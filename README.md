# vps-deployer

A small Next.js control panel for deploying and updating sites on a VPS that uses
the [Nginx Proxy Manager hub pattern](https://github.com/fpokrzywa/vps_buildout).
It wraps the `deploy-site` / `update-site` workflow in a web UI with live build logs.

## Features

- **Dashboard** — lists every site from `/root/prxyman/docker-compose.yml` with its
  app type and live container status; one-click **Update** per site.
- **Deploy** — clone a repo, build it, register it in the proxy compose, and start
  the container. Supports `static-vite`, `static-flutter`, `nextjs`, `docker-service`.
- **Update** — `git pull` + rebuild + restart, with streamed output.
- **Live logs** — build/deploy output streams to the browser over Server-Sent Events.
- **Auth** — single admin password; signed session cookie (Web Crypto HMAC).

The Next.js path bakes in the known fixes: the Prisma/Alpine `openssl` Dockerfile,
`output: 'standalone'` auto-patch, and `up -d` (not `restart`) so image rebuilds
take effect.

## Requirements

Runs **directly on the host as root** (it shells out to `git`, `npm`, `flutter`,
and `docker`, and edits `/root/prxyman/docker-compose.yml`). Expects:

- Docker + compose, Node 20+, and (for Flutter apps) Flutter at `/root/flutter`.
- The proxy hub at `/root/prxyman` (see the `vps_buildout` repo).

## Install (any VPS, one command)

```bash
# Public repo — HTTPS clone, no SSH key needed
git clone https://github.com/fpokrzywa/vps_deployer.git /root/deployer
cd /root/deployer
sudo bash install.sh
```

`install.sh` is **idempotent** and adapts to the box. It:

1. Checks Docker (errors with a pointer to the `vps_buildout` bootstrap if absent)
   and installs Node 20 if missing.
2. Ensures the proxy network exists (creates it if not).
3. **Adopts an already-running Nginx Proxy Manager** — connects it to the proxy
   network — or warns if none is running. (This is the case that bites a second
   VPS: an existing NPM from another stack already holds ports 80/443.)
4. Ensures the proxy compose file exists (creates a minimal one if not).
5. Generates `.env` with a random admin password + session secret (printed once).
6. Builds, installs a `vps-deployer` systemd service, opens the firewall for the
   proxy subnet, and prints the URL + NPM proxy-host details.

### Adapting to a different layout

Everything is env-driven (see `.env.example`). Override before running the
installer if this box differs from the defaults:

```bash
PORT=4600 PROXY_NETWORK=myproxy DEPLOYER_PROXY_DIR=/srv/proxy sudo -E bash install.sh
```

| Variable              | Default          | Meaning                                  |
|-----------------------|------------------|------------------------------------------|
| `PORT`                | `4500`           | Port the app listens on                  |
| `PROXY_NETWORK`       | `prxyman_proxy`  | Docker network apps + NPM share          |
| `DEPLOYER_PROXY_DIR`  | `/root/prxyman`  | Dir holding the proxy `docker-compose.yml` |
| `DEPLOYER_APPS_ROOT`  | `/root`          | Where app repos are cloned               |
| `DEPLOYER_FLUTTER_BIN`| `/root/flutter/bin` | Flutter SDK bin dir                   |

### Manual setup (if you prefer)

```bash
npm install && cp .env.example .env   # edit it
npm run build
# then install a systemd unit (see install.sh for the template) and:
systemctl enable --now vps-deployer
```

## Expose via NPM

The installer opens the firewall and prints the exact values. In NPM → Proxy
Hosts → Add: forward to the **proxy-network gateway IP** (shown by the installer,
e.g. `172.21.0.1`) on your chosen `PORT`, request an SSL cert.

> ⚠️ This app runs arbitrary builds as root. Keep it behind NPM + SSL (and ideally
> SSO). Do **not** expose the port publicly.

## Layout

```
app/            UI pages (dashboard, deploy, update, login) + API routes
components/      Nav, JobConsole (SSE log viewer)
lib/auth.js      session cookie + password
lib/compose.js   read/list sites, insert service blocks
lib/deploy.js    per-type build pipelines (deploy + update)
lib/jobs.js      in-memory job runner + event stream
middleware.js    auth gate
```
