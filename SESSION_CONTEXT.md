# Ear Candy — Agent Session Context

## Project Overview
Self-hostable podcast webapp. Stack: Fastify 4 + SQLite (better-sqlite3) + React 19 + Vite 5 + Tailwind CSS + Zustand. Single-container Docker deployment.

## Recent Changes Made

### 1. AGENTS.md Created
Comprehensive agent guide at repo root covering:
- All Makefile targets and per-package scripts
- Architecture (3-tier, no React Router, Zustand state)
- Code organization map
- 29 gotchas (env setup, auth cookies, DB booleans, SQLite single-row settings, etc.)

### 2. Makefile Fixes
- `make test`: Fixed by upgrading `better-sqlite3` from 11.10.0 → 12.11.1 (incompatible with Node 26)
- `make e2e` / `make e2e-ui`: Added health check that verifies `localhost:5173` is reachable before running Playwright. Fails fast with clear error if dev stack not running.
- `server/Dockerfile.dev`: Added `python3 make g++` to Alpine image so `better-sqlite3` can compile from source in Docker builds.

### 3. GitHub Actions CI/CD Pipeline
File: `.github/workflows/ci-cd.yml`
Jobs:
- `lint` — ESLint on server + client
- `test` — Vitest server (node) + client (jsdom)
- `typecheck` — `tsc --noEmit` on client
- `build` — Docker image to GHCR (Node 24 compatible actions: checkout@v7, buildx@v4, login@v4, metadata@v6, build-push@v7)
- `deploy` — SSH to Droplet, pull image, restart container, health check

### 4. Planning Directory Restructured
`planning/` now contains:
- `2026-05-05-ear-candy.md` — Original implementation plan
- `2026-05-05-podcast-webapp-design.md` — Design spec
- `2026-05-06-playwright-e2e.md` — E2E plan
- `2026-05-06-playwright-e2e-design.md` — E2E design spec
- `2026-05-06-ux-alignment.md` — UX alignment plan
- `2026-07-10-deploy-do-gitlab.md` — GitHub Actions deployment plan (refactored from GitLab)
- `2026-07-10-do-droplet-setup.md` — DigitalOcean droplet setup guide
- `mockups/` — 7 HTML UI mockups from `.superpowers/brainstorm/`

### 5. Scripts Added
- `scripts/setup-droplet.sh` — One-shot Ubuntu setup (Docker, Caddy, backups)

### 6. LICENSE
MIT License added and pushed.

### 7. GitHub Repo
Pushed to `git@github.com:midden-lab/ear-candy.git`

## Current Blocker / Next Step
DigitalOcean `doctl` CLI authentication. The `DIGITALOCEAN_ACCESS_TOKEN` env var needs to be set in the user's shell profile so `doctl` commands work across sessions.

## Commands to Run After Fresh Shell

### Set up doctl auth (one-time):
```bash
export DIGITALOCEAN_ACCESS_TOKEN="your-token-here"
# Or add to ~/.zshrc:
echo 'export DIGITALOCEAN_ACCESS_TOKEN="your-token-here"' >> ~/.zshrc
```

### Create Droplet:
```bash
doctl compute droplet create ear-candy \
  --image ubuntu-22-04-x64 \
  --size s-1vcpu-512mb-10gb \
  --region nyc1 \
  --ssh-keys $(doctl compute ssh-key list --format ID --no-header | head -1) \
  --wait
```

### Get IP and run setup:
```bash
DROPLET_IP=$(doctl compute droplet get ear-candy --format PublicIPv4 --no-header)
ssh root@$DROPLET_IP "bash -s" < scripts/setup-droplet.sh podcast.yourdomain.com $DROPLET_IP
```

### GitHub Secrets to Configure:
| Secret | Value |
|--------|-------|
| `SSH_PRIVATE_KEY` | `cat ~/.ssh/ear_candy_key` |
| `DROPLET_IP` | From above |
| `COOKIE_SECRET` | `openssl rand -hex 32` |
| `ADMIN_PASSWORD_HASH` | `cd server && node -e "const b=require('bcrypt'); b.hash('yourpassword',10).then(h=>console.log(h))"` |
| `GHCR_PAT` | GitHub PAT with `read:packages` |

## Key Files to Know
- `AGENTS.md` — Everything an agent needs
- `Makefile` — Dev commands
- `.github/workflows/ci-cd.yml` — CI/CD pipeline
- `planning/2026-07-10-do-droplet-setup.md` — Full DO setup guide
- `scripts/setup-droplet.sh` — Droplet provisioning script
- `Dockerfile` — Multi-stage production build
- `docker-compose.prod.yml` — Production compose (single container)
