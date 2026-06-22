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

## Setup

```bash
# HTTPS clone — works on any machine, no SSH key needed (repo is public)
git clone https://github.com/fpokrzywa/vps_deployer.git /root/deployer
cd /root/deployer
npm install
cp .env.example .env        # set ADMIN_PASSWORD + SESSION_SECRET
npm run build
```

> Use the HTTPS URL above on a fresh VPS. The `git@github.com:` (SSH) form only
> works if that machine's SSH key is registered on your GitHub account.

`.env`:
```
ADMIN_PASSWORD="a-strong-password"
SESSION_SECRET="$(openssl rand -base64 32)"
```

### Run as a service

```ini
# /etc/systemd/system/vps-deployer.service
[Unit]
Description=VPS Deployer
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
WorkingDirectory=/root/deployer
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now vps-deployer
```

It listens on `0.0.0.0:4500`.

## Expose via NPM

Allow the proxy network to reach it, then add a Proxy Host:

```bash
ufw allow from 172.21.0.0/16 to any port 4500 comment "NPM -> vps-deployer"
```

In NPM → Proxy Hosts → Add: forward to `172.21.0.1` port `4500`, request an SSL cert.

> ⚠️ This app runs arbitrary builds as root. Keep it behind NPM + SSL (and ideally
> SSO). Do **not** expose port 4500 publicly.

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
