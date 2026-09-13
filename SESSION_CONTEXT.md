# Ear Candy — Agent Session Context

This file is a point-in-time snapshot, kept for historical continuity from the project's early setup. **`CLAUDE.md` is the authoritative, actively-maintained reference** — read that first for anything about the codebase, gotchas, or conventions. This file exists mainly to record what infrastructure exists and where, for a human or agent picking the project back up after a long gap.

## Project Overview
Self-hostable podcast webapp. Stack: Fastify 5 + SQLite (`better-sqlite3`) + React 19 + Vite 5 + Tailwind CSS + Zustand. Single-container Docker deployment (see CLAUDE.md's "Docker & Deployment" gotchas for the full picture — multi-stage build, non-root runtime user, loopback-only port binding behind Caddy).

## Current State (as of 2026-08-30)

- **Production is live** at `earcandy.example.com`, deployed on a DigitalOcean Droplet. `doctl`/SSH access is set up and working (the "current blocker" this file used to describe — `doctl` auth — was resolved long ago; not an open item).
- **CI/CD** (`.github/workflows/ci-cd.yml`): `lint` → `test` → `typecheck` → `build` (pushes to GHCR by digest) → `e2e` (runs the built production image, `main`-targeting only) → `deploy` (SSH to the Droplet, pull by digest, restart) → `verify-production` (independent post-deploy health check). Every action and base image is SHA/digest-pinned; secrets flow through step-level `env:` blocks, never spliced into shell text.
- **Branching:** `main` is production (every push deploys). Work happens on a branch off `dev`, PR into `dev`, then a separate `dev`→`main` promotion PR (squash-merge) triggers the actual deploy. See CLAUDE.md's "Branching & Workflow" section for the full convention, including the post-squash-merge `dev` resync step.
- **Plans:** `plans/` holds active plan-architect/plan-executor plans (`NNN-kebab-case-name.md`, e.g. `plans/003-red-team-remediation.md`). `plans/archive/` holds the original pre-numbered-plan design docs (implementation plan, UX alignment, E2E design, Droplet setup, etc.) from before that convention existed — kept for historical context, not actively maintained.
- **First-party analytics** (page views, listen tracking, geo/device/referrer breakdowns) shipped — first-party only, no third-party services, per an explicit project constraint. See `plans/001-first-party-analytics.md`.
- **Security hardening:** issue #81 (port 3000 directly reachable) fixed — `plans/002-restrict-port-3000-to-loopback.md`. A five-agent red-team review produced 22 findings (0 critical); the actionable ones are tracked and mostly complete in `plans/003-red-team-remediation.md` (one step, raw client-IP request logging, still open by design — see that file).

## Key Files to Know
- `CLAUDE.md` — the actual, current source of truth for codebase knowledge, gotchas, and conventions. `AGENTS.md` is a redirect stub pointing here.
- `Makefile` — dev commands (`make up`, `make test`, `make e2e`, etc. — always use these, not the underlying npm/docker commands directly, per CLAUDE.md).
- `.github/workflows/ci-cd.yml` — CI/CD pipeline.
- `plans/` — active plans; `plans/archive/` — historical design docs.
- `scripts/setup-droplet.sh` — Droplet provisioning script (already run against the live Droplet; only relevant again if standing up a new one).
- `docs/runbooks/rotate-secrets.md` — secret rotation procedure.
- `Dockerfile` — multi-stage production build, the one actually deployed (the formerly-dead `client/Dockerfile` + `client/nginx.conf` describing an unused nginx-fronted deployment have since been removed).
