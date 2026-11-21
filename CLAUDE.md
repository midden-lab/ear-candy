# CLAUDE.md — Ear Candy

This document captures non-obvious knowledge about the Ear Candy codebase to help future agents work effectively without trial-and-error discovery. (This file used to live at `AGENTS.md`; that file is now a redirect stub pointing here.)

---

## Project Overview

Ear Candy is a self-hostable podcast webapp. Each deployment hosts a single podcast. Listeners browse seasons/episodes and play audio in the browser. Admins manage all content — episodes, seasons, cover art, favicon, site name, accent color — through a built-in web interface.

---

## Essential Commands

All commands should be run from the repo root unless noted.

**Claude Code: always invoke these via their `make` target, not the underlying `npm`/`docker` command directly** — `make test`, `make lint`, `make e2e`, `make e2e-ui`, `make up`, `make down`, `make setup`. This isn't just a style preference: `make e2e` runs `make e2e-reset-db` first, which wipes and re-seeds the local dev database for a deterministic run (see `e2e/CLAUDE.md`) — running `cd e2e && npm test` directly skips that reset and silently reintroduces the exact cascading-failure class documented in `e2e/CLAUDE.md` (a stale/manually-created season colliding by name with what the `seededPage` fixture seeds). If you need to run a *subset* of e2e specs (e.g. `npx playwright test tests/player.spec.ts`), still run `make e2e-reset-db` yourself immediately beforehand.

---

## Naming Conventions & Style

### TypeScript / General

- **ES modules everywhere.** All `package.json` have `"type": "module"`. All server imports use `.js` extensions (e.g., `import { buildApp } from './app.js'`).
- **File naming:** PascalCase for React components (`AppShell.tsx`, `AudioPlayer.tsx`), kebab-case for test files (`admin-auth.test.ts`), camelCase for utilities.
- **Interfaces:** Shared types live in `types.ts` at both `server/src/types.ts` and `client/src/types.ts`. They are kept in sync manually.
- **Boolean fields in DB:** Stored as SQLite `INTEGER` (0/1). Mapped to JS `boolean` in the `Episode`/`Season` interfaces. The `hidden` field is the canonical visibility flag.

### React

- **Components:** Default-export functional components. Props interfaces named `{ComponentName}Props`.
- **State hooks:** `useState` with explicit types. Form state uses individual `useState` hooks per field (not a single object).
- **Event handlers:** Named `handle{Action}` (e.g., `handleSubmit`, `handleSeasonSelect`).
- **CSS classes:** Tailwind utility classes. Accent color uses `bg-[var(--accent)]` / `text-[var(--accent-contrast)]` for dynamic theming. Every color class has a light default + `dark:` variant pair (e.g. `bg-zinc-50 dark:bg-zinc-950`) — there is no "base is dark" shortcut anymore.
- **Zustand:** Store exported as `use{Feature}Store`. State updates are simple setters.

### Server / Fastify

- **Route files:** Export a single `FastifyPluginAsync` named `{feature}Route`.
- **Route registration:** All routes registered with `{ prefix: '/api' }` in `app.ts`.
- **Admin routes:** All under `routes/admin/` and protected with `{ preHandler: requireAdmin }`.
- **DB access:** Via `app.db` (decorated `Database` instance). Use `app.db.prepare().run()` / `.get()` / `.all()`.
- **Error responses:** `reply.status(N).send({ error: '...' })`.

---

## Testing Approach

### Server Tests (`server/tests/`)

- **Runner:** Vitest with `environment: 'node'`, `globals: true`.
- **Test DB:** `:memory:` SQLite via `buildTestApp()` helper (`tests/helpers.ts`).
- **Pattern:** Each test creates its own app instance, seeds data via raw SQL, and uses `app.inject()` for HTTP requests. No running server needed.
- **Auth in tests:** Tests that need admin auth set `process.env.ADMIN_PASSWORD_HASH` to a bcrypt hash, then call login to get a cookie, and pass it in headers.
- **Cleanup:** `afterEach` often deletes `process.env.ADMIN_PASSWORD_HASH` to avoid cross-test pollution.

### Client Tests (`client/src/tests/`)

- **Runner:** Vitest with `environment: 'jsdom'`, `globals: true`.
- **Setup file:** `client/src/tests/setup.ts` mocks `localStorage` (Node v22+ native localStorage breaks without a valid file path), `matchMedia`, `ResizeObserver`, `URL.createObjectURL`/`revokeObjectURL`, and patches `HTMLMediaElement.prototype.src` to fire an async `error` event by default (jsdom never fires real media load events on its own — this stops anything awaiting audio duration probing from hanging forever). Also imports `@testing-library/jest-dom`.
- **Pattern:** Mock `fetch` and API module imports with `vi.mock()`. Mock `HTMLMediaElement` methods for audio player tests. Reset Zustand store state in `beforeEach`.
- **Important:** `vi.clearAllMocks()` wipes `HTMLMediaElement` mocks, so re-apply them after clearing.
- **Testing real audio duration detection:** `EpisodeFormPanel.test.tsx` stubs `window.Audio` wholesale via `vi.stubGlobal('Audio', ...)` with a controllable fake (settable `.duration`, manual `.emit('loadedmetadata' | 'durationchange' | 'error')`) — this bypasses the global jsdom patch above and gives full control over the probe's resolved value per test.

---

## Important Gotchas

### Environment & Setup

1. **`.env` is required for dev.** Run `make setup PASSWORD=...` to generate it. It creates `ADMIN_PASSWORD_HASH` (bcrypt) and a random `COOKIE_SECRET` (`openssl rand -hex 32`) — no local Node needed, the Makefile uses Docker to run bcrypt hashing.
2. **`buildApp` refuses to start without `COOKIE_SECRET`, and refuses a too-short one.** `server/src/app.ts` throws if `COOKIE_SECRET` is missing, and separately throws if it's set but under 32 characters (issue #40) — a short/guessable secret would let an attacker forge valid session cookies offline via HMAC brute-force. `make setup`'s generated secret (64 hex chars) clears this comfortably; anything hand-typed into `.env` should too.
3. **Server port in dev is 3001, client is 5173.** Vite proxies `/api`, `/audio`, and `/images` to the server — all three must be listed or requests silently fall through to the SPA `index.html` fallback (200, `text/html`) instead of reaching the API. In production, everything is on port 3000.
4. **`docker compose restart` doesn't pick up config-file changes.** The `client` dev service only bind-mounts `./client/src` — changes to `vite.config.ts`, `package.json`, etc. require a full `docker compose build client && docker compose up -d client`, not just a restart.

### Database

5. **SQLite schema has a versioned migrations pattern with an automatic pre-migration backup (issue #18).** `migrate.ts` runs `CREATE TABLE IF NOT EXISTS` for the base schema (always safe/idempotent, not version-tracked), then a numbered `MIGRATIONS` array of guarded `ALTER TABLE ... ADD COLUMN` steps — e.g. version 1 `episodes.cover_art_thumb_path`, version 2 `settings.favicon_path`, version 3 `settings.browser_tab_title`. Applied versions are recorded in a `schema_migrations` table (`version`, `description`, `applied_at`); a database that already had a column before version tracking existed gets that version backfilled (via each migration's `alreadyApplied` check) rather than re-running the `ALTER TABLE` and erroring on a duplicate column. **Before any pending migration runs against a real (non-`:memory:`) database**, `migrate.ts` checkpoints the WAL (`PRAGMA wal_checkpoint(TRUNCATE)` — folds recent writes into the main file first, since a raw copy of just `db.sqlite` under WAL mode could otherwise miss them) and copies the file to `data/db.sqlite.pre-migration-<ISO-timestamp>.bak`, a complete, self-contained, restorable snapshot from the exact moment before the schema changed. **Manual recovery procedure** (there's still no scripted `down()` — not realistic for arbitrary SQLite schema changes): stop the container, replace `data/db.sqlite` with the desired `.pre-migration-*.bak` file (delete any `-wal`/`-shm` siblings alongside it, since they'd reference the now-replaced file), restart. Backup files accumulate with no automatic pruning — periodic manual cleanup of old ones is expected, they're gitignored (`data/*.sqlite.pre-migration-*.bak`) so this is purely a disk-space concern, not a repo-hygiene one. New migrations must still stay additive/nullable-column-only — this backup net makes a *bad* migration recoverable, it doesn't make a genuinely destructive one (data-lossy backfill, restructuring) safe to write casually.
6. **Foreign keys are ON.** Deleting a season cascades to its episodes (see `ON DELETE CASCADE` in `episodes` table).
7. **WAL mode is enabled.** `db.pragma('journal_mode = WAL')`. Safe for single-process use; for multi-process, consider WAL limitations. Note: a Docker Desktop bind-mount can show a stale host-side view of a WAL-mode SQLite file relative to what the container process actually sees (encountered when trying to read the dev DB directly from the host) — read/write through the running container instead of the host filesystem when in doubt.
8. **Settings table has exactly one row.** `migrate.ts` inserts a default row if `COUNT(*) = 0`. The `DELETE FROM settings` + `INSERT` pattern in `admin/settings.ts` preserves this invariant.

### Auth / Security

8a. **`trustProxy` is configurable via `TRUSTED_PROXY_IPS` (comma-separated), not hardcoded — and the "obvious" default doesn't work in production.** `server/src/app.ts`'s `resolveTrustedProxies()` defaults to loopback-only (`127.0.0.1,::1`) when unset, which is correct for local dev/CI/e2e (no proxy in front there). Production sits behind Caddy, but Caddy runs on the Droplet host while the app runs in a container published via `docker run -p 3000:3000` — Docker NATs that host-to-container hop through the bridge network, so from *inside* the container, Caddy's connection appears to originate from the bridge gateway address (confirmed via `docker network inspect bridge`: `172.17.0.1` on the current Droplet), **not loopback**. A first fix attempt that hardcoded `trustProxy: ['127.0.0.1', '::1']` was deployed and looked fine, but real production request logs showed `remoteAddress: 172.17.0.1` — meaning `X-Forwarded-For` was never actually being trusted, silently leaving every real visitor collapsed into one shared IP for anything keyed on `req.ip` (the login lockout counter — issue #33). The deploy job (`.github/workflows/ci-cd.yml`) sets the real value (`TRUSTED_PROXY_IPS=127.0.0.1,::1,172.17.0.1`) directly in the `docker run` invocation, next to the rest of the deploy config it depends on — this is a property of this specific deployment's Docker networking, not something to bake into application source (a custom network or a different bridge subnet would silently break a hardcoded value again). **If this Droplet's Docker networking is ever reconfigured, re-verify the bridge gateway address and update the deploy job.**
9. **Admin session is a signed cookie with a 24h server-enforced expiry, and logout genuinely revokes it server-side.** `@fastify/cookie` with `signed: true`. The signed value is `authenticated:<issued-at-epoch-ms>:<session-epoch>` (see `buildSessionCookieValue` in `server/src/auth.ts`) — `requireAdmin` unsigns it, checks the embedded timestamp against `SESSION_MAX_AGE_MS` (24h) same as before, then additionally compares the cookie's embedded epoch against the live `settings.session_epoch` column. `POST /admin/logout` increments that column (`server/src/routes/admin/auth.ts`), which immediately invalidates every outstanding cookie, not just the browser's own — there's exactly one admin, so "logout" and "sign out everywhere" are the same operation (issue #34). Before this, logout only cleared the browser-side cookie: a copy obtained any other way (XSS, a compromised browser profile, a captured log — see gotcha #37b-adjacent request-logging concerns) stayed valid for up to 24h regardless. A cookie issued before this change (`authenticated:<ts>`, no epoch segment) fails the epoch-parsing check cleanly (401, not a crash) — same forced-logout-on-deploy effect as when the 24h expiry itself was first added (issue #30). `settings.session_epoch` (migration v6) is deliberately excluded from `GET /api/settings`'s response via an explicit column list instead of `SELECT *` — it's an internal auth-revocation counter, not something the public, unauthenticated settings endpoint should expose.
10. **No user model.** There is no users table. Only one admin password hash, stored in `ADMIN_PASSWORD_HASH` env var. Changing it currently requires regenerating the hash and redeploying — there's no in-app "change password" flow yet.
10a. **Admin login/logout is logged, but only as structured pino lines, not a durable audit table.** `routes/admin/auth.ts` logs `{ event: 'admin_login', outcome: 'success' | 'failure', ip }` on every login attempt and `{ event: 'admin_logout', ip }` on logout — deliberately never the submitted password itself. This is intentionally scoped down from a full audit-log table (issue #13, forensic-only, low urgency for a single-admin MVP) — and per gotcha #35/#8, these lines don't survive a deploy anyway since the container is destroyed and recreated on every release, so treat this as "greppable in the moment," not a permanent record.
11. **`AdminLayout` re-checks the session on mount** (`GET /api/admin/session`), as defense-in-depth against a forced/stale client-side `view` state rendering a broken admin shell whose data fetches would just 401. The real access boundary is still the server-side `requireAdmin` check on every admin API call.
12. **Favicon uploads deliberately exclude SVG.** Unlike PNG/ICO, an SVG can embed `<script>`/event handlers that execute if the uploaded file's URL is ever opened directly — a stored-XSS vector. Only `.png`/`.ico` are accepted.
13. **`accent_color` is admin-supplied with no format-level contrast validation.** The client computes a matching `--accent-contrast` (black/white) via WCAG luminance so accent-as-button-background never produces unreadable text, but this doesn't validate the accent color has sufficient contrast in every other context it's used (borders, focus rings, accent-as-text-on-surface). Worth knowing if you're touching anything accent-related.

### API & Routes

14. **Public episode endpoints filter by visibility.** `GET /api/episodes` and `GET /api/episodes/:id` both join with `seasons` and filter `e.hidden=0 AND s.hidden=0`. Admin endpoints return all rows.
15. **PATCH vs PUT on episodes/settings:** `PUT` fully replaces all fields (except defaults). `PATCH` dynamically builds `SET` clauses from the request body, validated against an allowlist (`ALLOWED_*_PATCH_FIELDS`) as a SQL-injection guard against arbitrary field names. Both always update `updated_at = datetime('now')`.
16. **Boolean serialization:** The DB stores `hidden` as `INTEGER` (0/1). In `PATCH`/`PUT` handlers, `hidden` is explicitly converted: `hidden ? 1 : 0` before writing to DB.
17. **Upload endpoints return a path string.** `POST /api/admin/upload` (audio) returns `{ path: "/audio/{uuid}.ext" }`. `POST /api/admin/upload/image` (cover art) returns `{ thumb, detail }` paths under `/images/`. `POST /api/admin/upload/favicon` returns `{ path: "/images/favicon-{uuid}.ext" }`. `isValidMediaPath` (`utils/validation.ts`) accepts both `/audio/` and `/images/` prefixes plus http(s) URLs.
17a. **HTTP Range requests (206 Partial Content) on `/audio/` work via `@fastify/static`'s default behavior — confirmed, not assumed.** No special config was added to enable this (issue #86); `@fastify/static` v10 handles `Range` headers out of the box. `server/tests/audio-range.test.ts` locks in that behavior with real byte-range assertions (200 without a `Range` header, 206 with `Content-Range` for a bounded/open-ended range, 416 for a range past EOF) — this is load-bearing for efficient seeking and mobile data usage, so treat any future `@fastify/static` version bump or config change to the `/audio/` registration in `app.ts` as needing this test re-run, not just the rest of the suite.
18. **Episode duration is auto-detected client-side, not server-validated.** `duration_seconds` used to always be `0` because nothing ever set it — the admin form now probes the real audio file/URL in the browser on save (see Client gotchas) and sends the detected value. The server just stores whatever `duration_seconds` it's given (validated only as "not negative").
18a. **Audio/favicon uploads are validated by magic bytes, not just extension/mimetype.** Both are client-supplied and trivially spoofable. `server/src/utils/magicBytes.ts`'s `peekHeader()` consumes just enough of the multipart stream to inspect the leading bytes (12 bytes covers every signature, since ISOBMFF/`m4a` needs the `ftyp` box type at offset 4-7), then returns a replay stream so the rest of the upload can still be piped to disk without buffering the whole thing in memory. `routes/admin/upload.ts` and `upload-favicon.ts` both reject with 400 if the real content doesn't match a recognized signature for the claimed extension (issue #38) — cover art upload (`upload-image.ts`) is unaffected since `sharp` already fails hard on non-image input there.

### Testing (server/client unit tests; e2e rules live in `e2e/CLAUDE.md`, client rules in `client/CLAUDE.md`)

26. **Server tests use `app.inject()`, not HTTP.** No server port binding. Fastify's `inject()` simulates HTTP requests.
27. **Client tests need a `localStorage` mock.** Node v22+ has a native `localStorage` that throws without a file path. `setup.ts` replaces it with an in-memory mock.

### Docker & Deployment

32. **Dev Dockerfiles are minimal.** `server/Dockerfile.dev` and `client/Dockerfile.dev` just `npm install` and copy files. The compose file mounts source volumes for hot reload.
33. **Production Dockerfile (root-level, monolithic) is multi-stage.** Stage 1 builds client, Stage 2 builds server TS, Stage 3 installs production deps (compiling native addons — bcrypt, better-sqlite3 — here, since Alpine needs `python3 make g++` only for this stage), Stage 4 is the final runner (compiled JS + static client files, no compilers). This is the image actually deployed — both `docker-compose.prod.yml` and CI's `deploy` job build/pull and run *this* `Dockerfile` directly via `SERVE_CLIENT=true` on a single port (3000).
33a. **The production container runs as the non-root `node` user (uid/gid 1000) built into every official `node:*-alpine` image — not root.** `Dockerfile`'s runner stage `chown -R node:node /app` then `USER node` before `CMD` (issue #36) — a remote-code-execution bug in the app or a dependency no longer grants root inside the container for free. This has a real migration consequence: the bind-mounted host directory (`/opt/ear-candy/data`, previously written by a root-running container and therefore root-owned) must be owned by uid 1000 or the new container fails immediately with `SQLITE_READONLY` on startup (confirmed directly — reproduced this exact crash locally against a deliberately root-owned volume before shipping the fix). The `deploy` job (`.github/workflows/ci-cd.yml`) runs `chown -R 1000:1000 /opt/ear-candy/data` after stopping the old container and before starting the new one, on every deploy — idempotent, so it's a no-op once already correct, not a one-time migration step someone has to remember. `scripts/setup-droplet.sh` also chowns the directory at creation time, so a fresh Droplet's very first deploy doesn't depend on the deploy job's chown being the first thing to touch it. CI's `e2e` job runs this image with **no volume mount at all** (fully ephemeral container filesystem), which is why the image's own `chown -R` in the `Dockerfile` matters independently of the host-side fix — both are needed, for different scenarios. Only the production `Dockerfile` changed; `server/Dockerfile.dev`/`client/Dockerfile.dev` (dev-only, bind-mount the live source tree from the host) still run as root, which is fine there — dev containers aren't exposed and a root-owned local dev bind-mount is the normal/expected pattern.
33b. **The Node base image is pinned by digest in all four `Dockerfile` stages and in `ci-cd.yml`'s CI-credential `docker run`, and Dependabot's `docker` ecosystem watches the root `Dockerfile`.** Keep every occurrence on the same digest when bumping (resolve it with `docker buildx imagetools inspect node:22.x.y-alpine`, never by hand). Dependabot only reads Dockerfiles, so the `ci-cd.yml` reference needs a manual bump. Caddy on the Droplet is upgraded by hand per `docs/runbooks/caddy-tls.md` ("Upgrading Caddy"), not by CI.
34. **`client/Dockerfile` + `client/nginx.conf` used to exist but were removed** (confirmed genuinely dead — no reference anywhere in `docker-compose.prod.yml`, CI, or the root `Dockerfile`). They described an alternate nginx-fronted deployment (separate client/server containers, nginx proxying `/api/`+`/audio/`) that nothing in this repo ever actually built or ran. Nginx is not involved in production; the root `Dockerfile` is the only one deployed.
35. **Production compose mounts `./data` for persistence.** Without this, the SQLite DB and uploads are lost on container restart. Actual production on the Droplet uses a raw `docker run` (not `docker-compose.prod.yml`) with `-v /opt/ear-candy/data:/app/data` — see CI/CD's `deploy` job. Both this file's `logging:` block and the `deploy` job's `docker run` carry matching `json-file` log rotation (`max-size=10m`, `max-file=3`, ~30MB cap) so they stay in sync even though the compose file isn't what's actually deployed (issue #8) — logs don't survive a deploy anyway, since `deploy` does `docker stop && docker rm` before `docker run` on every release, but this bounds disk usage between releases.
36. **Bcrypt hashes contain `$` characters.** When passing `ADMIN_PASSWORD_HASH` or `COOKIE_SECRET` to `docker run` in shell scripts (e.g., GitHub Actions deploy), always use single quotes (`'...'`) to prevent bash from interpreting `$` as variable expansion. Double quotes will corrupt the hash and login will fail silently.
37. **One-off production maintenance scripts** (`server/scripts/`, `scripts/downsample-audio-dir.sh`) have a non-obvious run pattern and pitfalls — use the `prod-maintenance-scripts` skill before running or writing one. Never run `npm install --no-save` directly in `/app` of the deployed image.

37b. **A file appearing on disk under the bind-mounted data directory does NOT mean a new env var pointing at it is actually in effect — the running container has to be told at `docker run` time.** Confirmed the hard way: `GEOIP_DB_PATH` (analytics' optional GeoIP lookup, see gotcha under Analytics/geography and `server/src/utils/geoip.ts`) was documented in `.env.example`/README and the `.mmdb` file was correctly fetched onto the production Droplet via `scripts/fetch-geoip-db.sh`, but the `deploy` job's `docker run` in `.github/workflows/ci-cd.yml` never actually set the env var — so the running container had no idea the file existed, and the country breakdown silently stayed empty in production until a human noticed while testing (issue #106). Env vars are fixed for the lifetime of a container; nothing about writing a file to its bind-mounted volume can retroactively inject a new environment variable into an already-running (or even a freshly-started-without-it) process. If a new env var needs to reach production, it must be added explicitly to the `deploy` job's `docker run` invocation (and, for local/manual production runs, `docker-compose.prod.yml`) — being in `.env.example` and the README documents it for humans, it doesn't wire it into the actual deploy.

### Sharing & Open Graph

44. **Server-rendered Open Graph tags for shared links only exist in production's single-container mode.** `server/src/app.ts`'s crawler-detection `onRequest` hook (backing `server/src/utils/crawler.ts`) is registered only inside the `if (clientDist && fs.existsSync(clientDist))` block — inert in dev's split client/server topology, active only when `SERVE_CLIENT=true`. It's scoped to exactly `/` (checked via `req.url.split('?')[0] !== '/'`) so a crawler-UA-flavored request to any other route (e.g. an API endpoint) can't be accidentally short-circuited into an OG-HTML response. `og:image` is resolved to an absolute URL (`${req.protocol}://${req.hostname}${path}`) before being emitted — cover art paths are stored/returned as site-relative paths, and the Open Graph spec requires an absolute `og:image` or link-preview unfurlers silently show no image at all (a real bug caught in a pre-production review, not a hypothetical).
45. **`og:url`'s origin trusts the request's `Host` header by default — an optional `PUBLIC_ORIGIN` env var pins it instead (issue #53).** `req.hostname` is attacker-controllable input (the `Host`/`X-Forwarded-Host` header), reflected — HTML-escaped, so not script-injectable — into the crawler-served OG response. This was a real (low-severity, escaped, metadata-only) open-redirect-flavored issue when the response also included a `<meta http-equiv="refresh">` pointing at that same attacker-controlled origin; the refresh tag has since been removed entirely (it was genuinely non-essential — bots read `<meta>` tags, they don't follow refreshes — so removing it was strictly safer, not a feature cut). `server/src/utils/crawler.ts`'s `resolveConfiguredOrigin` validates `process.env.PUBLIC_ORIGIN` (must be a bare `scheme://host[:port]`, no path, no trailing slash) and, if set and well-formed, `app.ts`'s crawler hook uses it instead of `${req.protocol}://${req.hostname}` — malformed or unset values fall straight back to the request-derived origin rather than crashing on a typo'd env var.

---

## Branching & Workflow

`main` is the production branch — every push to it deploys automatically (see CI/CD below). **Do not push directly to `main`.** All work happens on `dev` (or a branch off `dev`), then gets promoted to `main` via a PR that the maintainer reviews and merges by hand.

This is convention, not a technical enforcement: GitHub branch protection rules require a paid plan (or a public repo) and this repo is private on the Free plan, so `main` isn't actually lockable via GitHub's API today. Treat it as protected anyway. If a bad push to `main` ever happens, `git reset --hard origin/main` on the working branch and re-derive from there — don't try to force-fix forward under pressure.

**Promotion is a squash-merge.** After a PR merges, `dev`'s pre-merge commit history is no longer an ancestor of `main` (GitHub squashes to one commit). Sync `dev` back with `git checkout dev && git reset --hard origin/main && git push --force origin dev` — safe here since `dev`'s content is already fully folded into the squash commit on `main`, nothing is lost.

## CI/CD

`.github/workflows/ci-cd.yml` triggers on push to `main` or `dev`, and on PRs targeting `main`. Commits touching only `**.md` files (`paths-ignore`) skip the entire pipeline — no lint/test/build/e2e/deploy — since there's no code to validate. A commit mixing docs with code changes still runs everything normally (`paths-ignore` only skips when *every* changed file matches).

Jobs run in this order:

1. `lint` — ESLint on server + client (parallel with `test`/`typecheck`)
2. `test` — Vitest server + client
3. `typecheck` — `tsc --noEmit` on client
4. `build` — builds the root `Dockerfile` image, pushes to GHCR (needs lint+test+typecheck)
5. `e2e` — runs the pushed image as a container, waits on `/api/settings`, runs Playwright (52 tests, including 2 production-image-only OG-tag crawler tests that BASE_URL-gate-skip everywhere else) against it over HTTP (not the dev stack), uploads report/screenshots as artifacts on failure (needs build). **Only runs on `main` pushes or PRs targeting `main`** — plain pushes to `dev` skip it, since it's the slow/costly stage and `dev`'s safety net is meant to be fast (lint/test/build on every commit). Capped at `timeout-minutes: 15` (healthy runs take ~4-6 min) so a genuine hang (browser/network stall) fails fast instead of silently running for hours. Invoked directly as `npx playwright test`, not `npm test` — the npm wrapper was found to buffer all output until the child process exits normally, which hid a real ~20-minute cascading test failure behind what looked like total silence.
6. `deploy` — only on `main`; SSHes to the production Droplet, pulls the new image **by digest** (not tag — see below), records the currently-running image, stops/removes the old container, copies `db.sqlite` (+ `-wal`/`-shm` if present, exactly those names — never a glob) to `/opt/ear-candy/backups/pre-deploy_<UTC-timestamp>/*.predeploy` (newest 5 kept; the `.predeploy` suffix keeps them out of `backup.sh`'s recursive `*.sqlite` 14-day sweep; a failed copy aborts the deploy and restarts the previous image), starts the new container via the `run_app` shell function, and health-checks it. **On health-check failure it automatically rolls back** to the previously-running image (still exits non-zero so `verify-production` stays red); `docker image prune` only runs after a healthy check so the rollback image can't be pruned first. See `docs/runbooks/security-rollout.md` for the manual restore/rollback procedures and `scripts/prod-data-snapshot.sh` for the before/after data diff (needs build+e2e)

Note: CI's `e2e` job exercises the **production image**, not `docker compose up` — different from local `make e2e`, which requires the dev stack (`make up`).

**Security hardening conventions (established fixing issues #30-#33):**
- **Every `uses:` action and `node:20-alpine` base image is pinned to a full commit SHA / digest, not a mutable tag** (e.g. `actions/checkout@34e114...  # v4`) — a re-pointed tag on any pinned action would otherwise let a compromised upstream repo execute code with access to every secret in this workflow (`GHCR_PAT`, `SSH_PRIVATE_KEY`, `COOKIE_SECRET`, `ADMIN_PASSWORD_HASH`). When bumping a version, resolve the new tag's SHA via `git ls-remote --tags <repo> | grep refs/tags/vX` (cross-check with the GitHub API) — never hand-type a SHA.
- **No `${{ }}` is ever spliced directly into `run:`/`script:` text.** Every interpolated value (secrets, `github.sha`, etc.) goes through a step-level `env:` block and is referenced as `"$VAR"` inside the script — GitHub's own text-splicing would otherwise let a value containing shell metacharacters execute as literal script. For the `deploy` job's `appleboy/ssh-action` step specifically, this also requires the action's `envs:` input to forward the named vars into the *remote* script's shell environment — a plain `env:` block alone only sets vars in the local runner's context, not the SSH session.
- **`deploy` pulls by digest, not tag.** The `build` job resolves the pushed image's real digest from the registry itself via `docker buildx imagetools inspect` (not `docker/build-push-action`'s own `digest` output, which has documented reliability issues in some configs — upstream issues #461/#579/#770) and passes it to `deploy` as a job output. Pulling `image@sha256:...` makes the pull itself the integrity check — Docker verifies the content hash as part of pulling, so a tampered/wrong image simply fails to pull, rather than relying on a separate post-pull assertion that's easy to write as a no-op (the previous `docker inspect ... > /dev/null` pattern asserted nothing).
- **A top-level `permissions: contents: read` sets a least-privilege default for every job's `GITHUB_TOKEN`** (issue #42) — only `build` needs more (`packages: write`, to push to GHCR) and declares its own job-level `permissions:` block, which overrides the default for that job alone.
- **`verify-production` is a separate job from `deploy`** (issue #16) — `deploy`'s own SSH script already loops on `/api/health` internally and fails the job if it never comes up, but a distinct job SSHing in again afterward gives "the app is verified healthy" its own independently-visible CI result, so a future edit that accidentally breaks or removes `deploy`'s internal check still gets caught.
- **CI's `e2e` job generates a random `TEST_ADMIN_PASSWORD` every run** (issue #45), the same way it already generates a random `COOKIE_SECRET` — no hardcoded fallback value baked into the workflow, even though the ephemeral test container is only reachable from the runner itself.
- **Dependabot** (`.github/dependabot.yml`) watches `server/`, `client/`, `e2e/`'s npm dependencies and this repo's GitHub Actions weekly (issue #43) — it understands the `# vX` comment convention on SHA-pinned actions, so bump PRs still update both the SHA and the version comment together, consistent with how these are pinned manually per the convention above.

## Design Documents

`plans/` holds plan-architect/plan-executor plans (`NNN-kebab-case-name.md`); `plans/archive/` holds pre-convention design docs for historical context.

---

## When Adding Features

- **New API endpoint:** Add a Fastify plugin in `server/src/routes/` (or `routes/admin/`), register it in `server/src/app.ts`.
- **New DB column on an existing table:** Add a guarded `ALTER TABLE ... ADD COLUMN`, checked via `PRAGMA table_info`, to `server/src/db/migrate.ts` (see Database gotchas — this must stay additive/nullable, no backup/rollback tooling exists yet).
- **New DB table:** Add `CREATE TABLE IF NOT EXISTS` to `server/src/db/migrate.ts`. Add corresponding interface to `server/src/types.ts` and `client/src/types.ts`.
- **New client component:** Create in `client/src/components/` (listener) or `client/src/pages/admin/` (admin). Export default. Add test in `client/src/tests/`. Remember both light and dark Tailwind variants on every color class.
- **New E2E test:** Add to `e2e/tests/`. Use `seededPage` or `adminPage` fixtures from `e2e/fixtures.ts`. If it needs the browser to decode real audio, use `test-audio.wav` (real, decodable) not `test-audio.mp3` (synthetic stub) — and be aware real audio decoding is unreliable in CI regardless (see Testing gotchas).
- **New env var:** Add to `.env.example`, document in `README.md`, and read in `server/src/app.ts` or the relevant route. **If production needs it (not just local dev), also add it to the `deploy` job's `docker run` invocation in `.github/workflows/ci-cd.yml`** — a value documented in `.env.example`/README is not automatically passed to the production container; only what's explicitly listed in that `docker run` command reaches it. Missing this step is a real, already-happened mistake, not a hypothetical — see gotcha #37b.
