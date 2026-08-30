# CLAUDE.md — Ear Candy

This document captures non-obvious knowledge about the Ear Candy codebase to help future agents work effectively without trial-and-error discovery. (This file used to live at `AGENTS.md`; that file is now a redirect stub pointing here.)

---

## Project Overview

Ear Candy is a self-hostable podcast webapp. Each deployment hosts a single podcast. Listeners browse seasons/episodes and play audio in the browser. Admins manage all content — episodes, seasons, cover art, favicon, site name, accent color — through a built-in web interface.

**Stack:**
- **Server:** Fastify 5 + SQLite (`better-sqlite3`) + TypeScript (ES modules)
- **Client:** React 19 + Vite 5 + Tailwind CSS + Zustand
- **Auth:** Single admin password stored as a bcrypt hash in an env var
- **E2E:** Playwright
- **Deployment:** Docker Compose (dev) or a single monolithic multi-stage Dockerfile (production)

**Notable features beyond basic episode/season CRUD:**
- Episode cover art (upload → resized thumb + detail WebP variants via `sharp`), rendered responsively via `srcset`
- Admin-uploadable favicon (PNG/ICO only — SVG deliberately excluded, see Auth/Security gotchas)
- Configurable site name + separate browser-tab title (falls back to site name when unset)
- Full light/dark theme (dark is the default; toggle persists to `localStorage`)
- Admin-configurable accent color, with an auto-computed WCAG-contrast text color so a pale admin-chosen accent never produces unreadable button text
- Episode duration auto-detected client-side from the audio file/URL on save — no manual entry
- Per-episode playback resume: position is cached client-side in `localStorage` (`client/src/utils/episodeProgress.ts`) and offered back the next time that episode is loaded, regardless of which device-local session — see Client gotchas
- Episode sharing: a share dialog (`client/src/components/ShareDialog.tsx`) in the player produces a deep link (`?episode=X&t=Y`) that reopens the app at that exact episode/timestamp, with real Open Graph preview tags served to link-preview crawlers server-side — see Client and Server gotchas
- Browsing the episode list/detail pane is fully decoupled from what's actually loaded in the player — clicking an episode never auto-plays it or interrupts whatever's already playing in the background; only an explicit Play action (in the detail pane) changes what's loaded — see Client gotchas
- Episode list rows show live "remaining time" (decrementing while that episode is actually playing) once a listener has partially heard an episode

---

## Essential Commands

All commands should be run from the repo root unless noted.

**Claude Code: always invoke these via their `make` target, not the underlying `npm`/`docker` command directly** — `make test`, `make lint`, `make e2e`, `make e2e-ui`, `make up`, `make down`, `make setup`. This isn't just a style preference: `make e2e` runs `make e2e-reset-db` first, which wipes and re-seeds the local dev database for a deterministic run (see gotcha #28) — running `cd e2e && npm test` directly skips that reset and silently reintroduces the exact cascading-failure class documented in gotcha #30 (a stale/manually-created season colliding by name with what the `seededPage` fixture seeds). If you need to run a *subset* of e2e specs (e.g. `npx playwright test tests/player.spec.ts`), still run `make e2e-reset-db` yourself immediately beforehand.

| Command | Description |
|---------|-------------|
| `make setup PASSWORD=yourpassword` | Generate `.env` file with bcrypt hash. Fails if `.env` already exists. |
| `make up` | Start dev stack (`docker compose up --build`). Server on `:3001`, client on `:5173`. |
| `make down` | Stop dev stack. |
| `make logs` | Tail dev stack logs. |
| `make test` | Run server unit tests (`cd server && npm test`) then client unit tests (`cd client && npm test`). |
| `make lint` | Lint server (`cd server && npm run lint`) then client (`cd client && npm run lint`). |
| `make e2e` | Run Playwright E2E tests (`cd e2e && npm test`). **Requires `make up` first.** Wipes and re-seeds the local dev database first (`make e2e-reset-db`) for a clean, deterministic run — see gotcha #28. |
| `make e2e-ui` | Open Playwright UI mode. Same DB reset as `make e2e`. |
| `make build-prod` | Build production Docker image (`docker build -t ear-candy .`, the root monolithic `Dockerfile`). |
| `make up-prod` | Start production stack (`docker compose -f docker-compose.prod.yml up -d`) — also just builds/runs the root `Dockerfile`, see Docker & Deployment gotchas. |

**Per-package commands:**

- **Server:** `cd server && npm run dev` (tsx watch), `npm test` (vitest, 166 tests), `npm run lint` (eslint)
- **Client:** `cd client && npm run dev` (vite), `npm test` (vitest + jsdom, 334 tests + 3 skipped), `npm run lint` (eslint), `npm run typecheck` (tsc --noEmit)
- **E2E:** `cd e2e && npm test` (playwright, 48 tests, 2 skipped outside CI's production-image run), `npm run test:ui` (playwright --ui) — prefer `make e2e`/`make e2e-ui` (see note above)

---

## Architecture & Data Flow

### Three-Tier Structure

```
Client (React + Vite)  →  Server (Fastify + SQLite)  →  SQLite DB + File Uploads
        :5173                    :3001                    data/db.sqlite
                                                          data/uploads/
```

In **dev**, client and server run as separate Docker services. In **production**, the server serves the built client static files from `dist/client/` (enabled by `SERVE_CLIENT=true`) — everything runs as a single container/process on one port.

### Server Architecture

- **Entry point:** `server/src/server.ts` — creates app, listens on `PORT`, handles SIGTERM/SIGINT shutdown.
- **App factory:** `server/src/app.ts` — `buildApp(opts)` creates a Fastify instance, wires plugins (cookie, multipart, static), registers all routes, and decorates `app.db`.
- **Database:** `better-sqlite3` with WAL mode and foreign keys. Initialized in `server/src/db/index.ts`, schema created/migrated in `server/src/db/migrate.ts`.
- **Routes:** All routes are Fastify plugin async functions registered under `/api` prefix. Split into public (`routes/`) and admin (`routes/admin/`) directories.
- **Auth:** `requireAdmin` preHandler checks for a signed `admin_session` cookie. Cookie secret comes from `COOKIE_SECRET` env var. Admin password verified via bcrypt against `ADMIN_PASSWORD_HASH`.
- **File uploads:** `@fastify/multipart` handles uploads to `data/uploads/`. Audio served statically at `/audio/`, images (cover art, favicon) at `/images/`. Max audio upload size: 500MB.

### Client Architecture

- **Entry point:** `client/src/main.tsx` → renders `App.tsx`.
- **App.tsx:** Root component with simple view routing (`'player' | 'admin-login' | 'admin'`). No router library — just state-driven conditional rendering. It does read `window.location.search` once at boot to resolve a shared deep link (`?episode=X&t=Y`) and writes `?episode=` back via `history.replaceState` on episode selection (in `EpisodeList.tsx`) — this is one-directional URL syncing, not client-side routing; there's no `popstate` listener, see Client gotchas.
- **State management:** Zustand in `client/src/store/playerStore.ts` for audio player state (episode, playing, currentTime, duration, speed, loading, error, retryNonce) — this is *only* the player's own state. `App.tsx` separately holds `viewingEpisode` (which episode the detail pane shows) as plain `useState`, deliberately decoupled from the store — see Client gotchas on why.
- **API layer:** `client/src/api.ts` — typed fetch wrappers. Public endpoints use plain fetch; admin endpoints use `credentials: 'include'` for cookie auth.
- **Theming:** `useTheme` hook reads/writes `localStorage` key `'theme'` and toggles `.dark` class on `<html>`. Dark is the default (no saved preference → dark) so existing users never see an unannounced theme change. Accent color is set as CSS variable `--accent` on `:root`, with `--accent-contrast` (black/white, computed via WCAG relative luminance in `client/src/utils/color.ts`) set alongside it for readable text on admin-chosen accent colors.
- **Styling:** Tailwind CSS with `darkMode: 'class'`. Every component has both light and dark variants — this wasn't always true (see `CHANGELOG`-style note in Client gotchas below if you're wondering why every class has a `dark:` pair).

---

## Code Organization

```
ear-candy/
├── server/
│   ├── src/
│   │   ├── app.ts              # Fastify app factory (buildApp)
│   │   ├── server.ts           # Entry point
│   │   ├── auth.ts             # requireAdmin preHandler
│   │   ├── types.ts            # Shared TS interfaces (Settings, Season, Episode)
│   │   ├── db/
│   │   │   ├── index.ts        # initDb(dbPath) — WAL, FK, migrations
│   │   │   └── migrate.ts      # Schema creation + guarded ALTER TABLE migrations + seed settings row
│   │   ├── routes/
│   │   │   ├── health.ts         # GET /api/health
│   │   │   ├── settings.ts       # GET /api/settings
│   │   │   ├── seasons.ts        # GET /api/seasons (visible only)
│   │   │   ├── episodes.ts       # GET /api/episodes, /api/episodes/:id (visible only)
│   │   │   └── admin/
│   │   │       ├── auth.ts             # POST /api/admin/login, logout, session
│   │   │       ├── seasons.ts          # CRUD seasons
│   │   │       ├── episodes.ts         # CRUD episodes
│   │   │       ├── upload.ts           # POST /api/admin/upload (audio)
│   │   │       ├── upload-image.ts     # POST /api/admin/upload/image (episode cover art — thumb+detail WebP via sharp)
│   │   │       ├── upload-favicon.ts   # POST /api/admin/upload/favicon (PNG/ICO only)
│   │   │       └── settings.ts         # PUT/PATCH /api/admin/settings
│   │   └── utils/
│   │       ├── duration.ts     # parseDuration, formatDuration
│   │       ├── validation.ts   # isValidMediaPath and friends (accepts /audio/, /images/, http(s) URLs)
│   │       └── crawler.ts      # isKnownCrawler, renderEpisodeOgHtml — OG tags for shared-link preview bots
│   ├── scripts/                # One-off maintenance scripts (see Docker & Deployment gotchas)
│   ├── tests/                  # Vitest tests (node env, globals), 166 tests
│   │   └── helpers.ts          # buildTestApp(), buildTestDb()
│   └── data/                   # SQLite DB + uploads (gitignored)
│
├── client/
│   ├── src/
│   │   ├── App.tsx             # Root + view routing + boot-time deep-link resolution + viewingEpisode state
│   │   ├── api.ts              # Fetch wrappers
│   │   ├── types.ts            # Shared TS interfaces (mirrors server)
│   │   ├── index.css           # Tailwind directives + CSS variables (--accent, --accent-contrast)
│   │   ├── store/
│   │   │   └── playerStore.ts  # Zustand player state — episode/playing/currentTime/duration/speed only
│   │   ├── hooks/
│   │   │   ├── useTheme.ts       # Dark/light mode + accent color/contrast
│   │   │   └── useBreakpoint.ts  # Responsive breakpoint hook (mobile/desktop layout switching)
│   │   ├── utils/
│   │   │   ├── color.ts             # getContrastTextColor (WCAG luminance-based black/white pick)
│   │   │   ├── episodeProgress.ts   # get/save/clearEpisodeProgress — localStorage resume-position cache
│   │   │   └── shareUrl.ts          # buildShareUrl, buildTweetIntentUrl/buildBlueskyIntentUrl/buildFacebookIntentUrl
│   │   ├── components/         # Listener UI: AppShell, AudioPlayer(View), DetailPane, EpisodeItem/List(View),
│   │   │                       # EpisodeCoverArt (responsive srcset thumb/detail), IconRail, MobileHeader,
│   │   │                       # ThemeBadge, SeasonTabs, PillBadge, ProgressBar, ShareDialog (portal modal)
│   │   ├── pages/
│   │   │   ├── AdminLogin.tsx
│   │   │   └── admin/          # AdminLayout (session check on mount), EpisodeManager, EpisodeFormPanel,
│   │   │                       # SeasonBlock, AdminSettings
│   │   └── tests/              # Vitest tests (jsdom env, globals), 334 tests + 3 skipped
│   │       └── setup.ts        # localStorage/matchMedia/ResizeObserver/Audio mocks + jest-dom
│   ├── vite.config.ts          # Vite + proxy /api, /audio, and /images to server
│   └── tailwind.config.ts      # darkMode: 'class'
│
├── e2e/
│   ├── fixtures.ts             # Custom Playwright fixtures (seededPage, adminPage)
│   ├── fixtures/               # Test media files (audio, cover art, favicon)
│   ├── playwright.config.ts    # workers: 1, chromium only
│   └── tests/                  # E2E specs, 48 tests across admin/listener/mobile/player/screenshot/sharing/theme (2 skip unless running against the production image)
│
├── planning/                  # Design specs and plans (historical context)
├── scripts/
│   ├── hash-password.sh        # bcrypt hash helper
│   └── downsample-audio-dir.sh # local tool: downsample a directory of audio files to a target bitrate (gotcha #37a)
├── Makefile                  # Primary dev commands
├── docker-compose.yml        # Dev stack
├── docker-compose.prod.yml   # Production stack — builds/runs the root Dockerfile, NOT client/Dockerfile (see gotcha)
└── Dockerfile                # Multi-stage production build (the one actually deployed)
```

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

### Server Tests (`server/tests/`) — 166 tests

- **Runner:** Vitest with `environment: 'node'`, `globals: true`.
- **Test DB:** `:memory:` SQLite via `buildTestApp()` helper (`tests/helpers.ts`).
- **Pattern:** Each test creates its own app instance, seeds data via raw SQL, and uses `app.inject()` for HTTP requests. No running server needed.
- **Auth in tests:** Tests that need admin auth set `process.env.ADMIN_PASSWORD_HASH` to a bcrypt hash, then call login to get a cookie, and pass it in headers.
- **Cleanup:** `afterEach` often deletes `process.env.ADMIN_PASSWORD_HASH` to avoid cross-test pollution.

### Client Tests (`client/src/tests/`) — 334 tests + 3 skipped

- **Runner:** Vitest with `environment: 'jsdom'`, `globals: true`.
- **Setup file:** `client/src/tests/setup.ts` mocks `localStorage` (Node v22+ native localStorage breaks without a valid file path), `matchMedia`, `ResizeObserver`, `URL.createObjectURL`/`revokeObjectURL`, and patches `HTMLMediaElement.prototype.src` to fire an async `error` event by default (jsdom never fires real media load events on its own — this stops anything awaiting audio duration probing from hanging forever). Also imports `@testing-library/jest-dom`.
- **Pattern:** Mock `fetch` and API module imports with `vi.mock()`. Mock `HTMLMediaElement` methods for audio player tests. Reset Zustand store state in `beforeEach`.
- **Important:** `vi.clearAllMocks()` wipes `HTMLMediaElement` mocks, so re-apply them after clearing.
- **Testing real audio duration detection:** `EpisodeFormPanel.test.tsx` stubs `window.Audio` wholesale via `vi.stubGlobal('Audio', ...)` with a controllable fake (settable `.duration`, manual `.emit('loadedmetadata' | 'durationchange' | 'error')`) — this bypasses the global jsdom patch above and gives full control over the probe's resolved value per test.

### E2E Tests (`e2e/tests/`) — 48 tests (2 skipped outside the production-image CI run)

- **Runner:** Playwright with `workers: 1` (tests share a real database, must run serially — see the cascading-failure gotcha below for why this matters more than it looks).
- **Base URL:** `http://localhost:5173` (dev client). **Requires `make up` running.** Always run the suite via `make e2e`/`make e2e-ui`, not `cd e2e && npm test` directly — see gotcha #28.
- **Fixtures:**
  - `seededPage`: Logs in via API, seeds a season + 2 episodes, navigates to `/`, then tears down (deletes season, resets settings) in a `finally`. Use for listener UI tests.
  - `adminPage`: Logs in via browser request, clicks admin gear, navigates to admin panel. Use for admin panel tests. `admin.spec.ts`'s shared `afterEach` also closes any stuck open form panel first (see gotcha below) before deleting the last season.
- **Auth password:** `process.env.TEST_ADMIN_PASSWORD` or defaults to `'changeme'` — this default is only ever used locally (`make e2e` against the dev stack). CI's `e2e` job generates a fresh random `TEST_ADMIN_PASSWORD` every run instead of relying on any hardcoded value (issue #45) — see `ci-cd.yml`'s "Generate CI-only credentials" step.
- **Real audio fixtures:** `e2e/fixtures/test-audio.wav` is a real, 16-bit PCM, 2-second decodable WAV — used anywhere a test needs the browser to actually decode audio (e.g. duration detection). `test-audio.mp3` is a synthetic ~1KB stub that's fine for exercising the upload endpoint but is NOT reliably decodable by a real browser (confirmed: works locally, fails in GitHub Actions' Chromium — don't use it for anything that needs a real decoded duration).

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
9. **Admin session is a signed cookie with a 24h server-enforced expiry.** `@fastify/cookie` with `signed: true`. The signed value is `authenticated:<issued-at-epoch-ms>` (see `buildSessionCookieValue` in `server/src/auth.ts`) — `requireAdmin` unsigns it, then independently checks the embedded timestamp against `SESSION_MAX_AGE_MS` (24h), not just the browser-side cookie `maxAge` (a replayed/manipulated client could otherwise ignore that). A cookie issued before this change (plain `'authenticated'`, no timestamp) still passes signature validation but fails the format check cleanly (401, not a crash) — so deploying this fix force-logs-out whoever was already signed in, which is the intended effect (issue #30 — unbounded-lifetime sessions were the problem being fixed).
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

### Client

19. **No React Router.** Navigation is entirely state-driven in `App.tsx` (`view: 'player' | 'admin-login' | 'admin'`). Admin panel has its own tab state (`adminTab: 'episodes' | 'settings'`).
20. **Accent color + contrast are CSS variables.** `useTheme` sets `--accent` on `:root` and computes `--accent-contrast` (`getContrastTextColor`, WCAG relative luminance) alongside it. Components reference them via `bg-[var(--accent)]` / `text-[var(--accent-contrast)]` — never hardcode `text-white` next to an accent background, since the accent color is admin-configurable and could be pale.
21. **Dark is the default theme, not light.** `useTheme`'s initial state is `localStorage.getItem('theme') !== 'light'` — i.e. anything other than an explicit `'light'` choice defaults to dark. This is intentional: before light mode was actually implemented, the toggle existed but did nothing (no `dark:` styling anywhere), so defaulting new/existing users to dark preserves the app's long-standing look rather than silently changing it once light mode started actually rendering.
22. **Episode duration auto-detection happens at different times depending on audio type.** Uploaded files: probed immediately via a local object URL (`URL.createObjectURL`, no network/CORS concerns) in parallel with the upload. URL-based audio: probed at *submit* time, not on blur — an earlier on-blur version caused a real, reproducible Save-button click failure (the network fetch + resulting re-render could land mid-click). A failed probe never blocks saving and never overwrites a previously-known-good duration on edit. See `EpisodeFormPanel.tsx`'s `probeAudioDuration`.
23. **Chrome can report `duration: Infinity` on `loadedmetadata`** for audio files without a proper duration header (some MP3s), only resolving the real value afterward via a `durationchange` event. `probeAudioDuration` listens for both.
24. **Audio player uses a hidden `<audio>` element.** `AudioPlayerView.tsx` creates an `<audio>` ref and controls it via `audioRef.current.play()` / `.pause()`. Time updates come from `onTimeUpdate` events.
25. **Zustand store is module-level.** Import `usePlayerStore` and call `.setState()` or `.getState()` directly in tests. Wrap in `act()` when rendering is involved.

### Testing

26. **Server tests use `app.inject()`, not HTTP.** No server port binding. Fastify's `inject()` simulates HTTP requests.
27. **Client tests need a `localStorage` mock.** Node v22+ has a native `localStorage` that throws without a file path. `setup.ts` replaces it with an in-memory mock.
28. **E2E tests require the dev stack running.** `make e2e` does NOT start services. Run `make up` first. Tests hit the real database, so `workers: 1` is mandatory. `make e2e` (and `make e2e-ui`) also run `make e2e-reset-db` first, which stops the `server` container, deletes `server/data/db.sqlite*` on the host (the dev compose file bind-mounts `./server/data`), and restarts it — migrations recreate an empty schema on boot. **This destroys any manually-added local dev content** (episodes/seasons/settings you created by hand while poking at the app) every time you run the E2E suite locally — always run E2E tests via `make e2e`/`make e2e-ui`, never `cd e2e && npm test` directly, or you lose this guarantee. Added after real local runs cascaded into near-total failure because a manually-created season happened to collide by name with what `seededPage` seeds (see gotcha #30) — CI never hits this since its `e2e` job always runs against a fresh, empty container.
29. **E2E fixtures use API request context for setup, browser context for admin.** `seededPage` uses `request.post()` (isolated API context) to seed data. `adminPage` uses `page.request.post()` (shares browser cookie jar) to log in.
30. **E2E tests clean up after themselves — and that cleanup being robust matters a lot.** `seededPage` deletes its season and resets settings in a `finally`. `admin.spec.ts`'s shared `afterEach` deletes the last season, but first closes any leftover open form panel (`Cancel` button, if visible) — without that, a single test failing mid-form leaves the panel open, the cleanup click gets intercepted by it, times out, and every subsequent test in the run inherits the polluted DB state and fails too. A real ~20-minute cascading failure across 22 of 44 tests looked like a silent CI hang before this was root-caused (see `music-metadata`/audio-decoding gotcha below for the actual trigger). A second, distinct flavor of this same failure class was hit locally: `seededPage` always seeds a season titled exactly `"Season 1"`, which silently collided with a manually-created local season of the same name, producing `strict mode violation: ... resolved to 2 elements` and cascading from there — this is what `make e2e-reset-db` (gotcha #28) now prevents.
31. **Real browser audio decoding is unreliable in GitHub Actions' headless Chromium specifically** — confirmed via a test that passed 100% locally and failed 100% in CI regardless of the WAV file's bit depth (8-bit and 16-bit both failed identically), most likely a missing audio backend on the minimal runner image. Don't write e2e assertions that depend on the browser successfully decoding real audio duration — that logic is already covered by unit tests with a controllable fake `Audio` (see Client Tests above). `npm test`'s output buffering also hid this cascading failure behind what looked like a total silent hang — CI now invokes `npx playwright test` directly for real-time log streaming (see CI/CD).

### Docker & Deployment

32. **Dev Dockerfiles are minimal.** `server/Dockerfile.dev` and `client/Dockerfile.dev` just `npm install` and copy files. The compose file mounts source volumes for hot reload.
33. **Production Dockerfile (root-level, monolithic) is multi-stage.** Stage 1 builds client, Stage 2 builds server TS, Stage 3 installs production deps (compiling native addons — bcrypt, better-sqlite3 — here, since Alpine needs `python3 make g++` only for this stage), Stage 4 is the final runner (compiled JS + static client files, no compilers). This is the image actually deployed — both `docker-compose.prod.yml` and CI's `deploy` job build/pull and run *this* `Dockerfile` directly via `SERVE_CLIENT=true` on a single port (3000).
33a. **The production container runs as the non-root `node` user (uid/gid 1000) built into every official `node:*-alpine` image — not root.** `Dockerfile`'s runner stage `chown -R node:node /app` then `USER node` before `CMD` (issue #36) — a remote-code-execution bug in the app or a dependency no longer grants root inside the container for free. This has a real migration consequence: the bind-mounted host directory (`/opt/ear-candy/data`, previously written by a root-running container and therefore root-owned) must be owned by uid 1000 or the new container fails immediately with `SQLITE_READONLY` on startup (confirmed directly — reproduced this exact crash locally against a deliberately root-owned volume before shipping the fix). The `deploy` job (`.github/workflows/ci-cd.yml`) runs `chown -R 1000:1000 /opt/ear-candy/data` after stopping the old container and before starting the new one, on every deploy — idempotent, so it's a no-op once already correct, not a one-time migration step someone has to remember. `scripts/setup-droplet.sh` also chowns the directory at creation time, so a fresh Droplet's very first deploy doesn't depend on the deploy job's chown being the first thing to touch it. CI's `e2e` job runs this image with **no volume mount at all** (fully ephemeral container filesystem), which is why the image's own `chown -R` in the `Dockerfile` matters independently of the host-side fix — both are needed, for different scenarios. Only the production `Dockerfile` changed; `server/Dockerfile.dev`/`client/Dockerfile.dev` (dev-only, bind-mount the live source tree from the host) still run as root, which is fine there — dev containers aren't exposed and a root-owned local dev bind-mount is the normal/expected pattern.
34. **`client/Dockerfile` + `client/nginx.conf` are unused/dead.** They describe an alternate nginx-fronted deployment (separate client/server containers, nginx proxying `/api/`+`/audio/`) that nothing in this repo actually builds or runs anymore — not `docker-compose.prod.yml`, not CI. Don't assume nginx is involved in production; it isn't. (Worth a cleanup pass to remove these if confirmed genuinely dead.)
35. **Production compose mounts `./data` for persistence.** Without this, the SQLite DB and uploads are lost on container restart. Actual production on the Droplet uses a raw `docker run` (not `docker-compose.prod.yml`) with `-v /opt/ear-candy/data:/app/data` — see CI/CD's `deploy` job. Both this file's `logging:` block and the `deploy` job's `docker run` carry matching `json-file` log rotation (`max-size=10m`, `max-file=3`, ~30MB cap) so they stay in sync even though the compose file isn't what's actually deployed (issue #8) — logs don't survive a deploy anyway, since `deploy` does `docker stop && docker rm` before `docker run` on every release, but this bounds disk usage between releases.
36. **Bcrypt hashes contain `$` characters.** When passing `ADMIN_PASSWORD_HASH` or `COOKIE_SECRET` to `docker run` in shell scripts (e.g., GitHub Actions deploy), always use single quotes (`'...'`) to prevent bash from interpreting `$` as variable expansion. Double quotes will corrupt the hash and login will fail silently.
37. **One-off maintenance scripts live in `server/scripts/`, run against production via a throwaway container.** E.g. `backfill-durations.mjs` populated `duration_seconds` for upload-type episodes that predated the auto-detect-on-save feature (already run against production on 2026-07-13, fixed episodes #96-#100 — see the script's own header for status; it's idempotent and safe to re-run if the gap ever resurfaces, but no further action is expected). URL-type episodes never needed this — they self-heal automatically (re-probed unconditionally on every save); upload-type only re-probes when a new file is explicitly re-selected. `downsample-audio.sh` is a similar one-off: it re-encodes published upload-type episode audio from its as-uploaded 192kbps down to 128kbps stereo mp3 in place on the Droplet (a DAW/export-default bitrate that was never a deliberate choice), backing up originals to `/opt/ear-candy/backups/audio-192k/` first and preserving filenames so it needs zero DB writes — see the script's own header for status/idempotency details. Unlike `backfill-durations.mjs` (pure Node against the DB), this one is bash because it orchestrates two separate containers — the deployed app image (to read the episode list) and a pinned `ffmpeg` image (to transcode) — neither of which has both capabilities alone. Pattern for running one of these against production:
    ```bash
    # from local machine, with an SSH config alias set up for the Droplet:
    scp server/scripts/<script>.mjs earcandy:/opt/ear-candy/
    ssh earcandy
    # on the Droplet — mounts the real data dir into a disposable container
    # sharing the already-deployed image; never touches the live `ear-candy`
    # container itself:
    docker run --rm \
      -v /opt/ear-candy/data:/app/data \
      -v /opt/ear-candy/<script>.mjs:/app/<script>.mjs \
      -w /app \
      $(docker inspect ear-candy --format='{{.Config.Image}}') \
      sh -c 'npm install <any-needed-devDependency> --no-save && node <script>.mjs'   # dry run first if the script supports one
    # review output, then re-run with --apply (or whatever the script's write flag is)
    # to actually write. Delete the copied script from /opt/ear-candy/ afterward —
    # it's not meant to persist there.
    ```
    Any library a one-off script needs (e.g. `music-metadata`, pure JS, no native compile needed) should be added as a server devDependency only — never part of the production image, since the Dockerfile's `deps` stage runs `npm ci --omit=dev`.

37a. **`scripts/downsample-audio-dir.sh` (repo root, not `server/scripts/`) is a general-purpose LOCAL tool, not a one-off run against production.** Point it at any local directory of audio files and it downsamples each to a target bitrate (default 128kbps) via ffmpeg, writing the output alongside the original with the bitrate in the filename (e.g. `Episode 12.mp3` → `Episode 12-128k.mp3`) — it never modifies or deletes the source. It prefers a local `ffmpeg`/`ffprobe` on `PATH` and otherwise falls back to the same pinned `jrottenberg/ffmpeg:7-alpine` Docker image the production `downsample-audio.sh` uses, so it needs zero local setup beyond Docker. That image is amd64-only, so it runs under emulation on Apple Silicon (confirmed working, just slower) — `brew install ffmpeg` avoids that. Written to be portable to macOS's stock bash 3.2 (no `declare -A`; codec-by-extension lookup is a `case` statement instead) since that's what ships on a Mac with no dev tooling installed.

37b. **A file appearing on disk under the bind-mounted data directory does NOT mean a new env var pointing at it is actually in effect — the running container has to be told at `docker run` time.** Confirmed the hard way: `GEOIP_DB_PATH` (analytics' optional GeoIP lookup, see gotcha under Analytics/geography and `server/src/utils/geoip.ts`) was documented in `.env.example`/README and the `.mmdb` file was correctly fetched onto the production Droplet via `scripts/fetch-geoip-db.sh`, but the `deploy` job's `docker run` in `.github/workflows/ci-cd.yml` never actually set the env var — so the running container had no idea the file existed, and the country breakdown silently stayed empty in production until a human noticed while testing (issue #106). Env vars are fixed for the lifetime of a container; nothing about writing a file to its bind-mounted volume can retroactively inject a new environment variable into an already-running (or even a freshly-started-without-it) process. If a new env var needs to reach production, it must be added explicitly to the `deploy` job's `docker run` invocation (and, for local/manual production runs, `docker-compose.prod.yml`) — being in `.env.example` and the README documents it for humans, it doesn't wire it into the actual deploy.

### Linting

38. **Both server and client use `typescript-eslint` recommended.** Server config is minimal. Client adds `eslint-plugin-react` and `eslint-plugin-react-hooks`.
39. **`argsIgnorePattern: '^_'`** is configured for `@typescript-eslint/no-unused-vars` in both packages.

### Browsing vs. playing, resume position, and sharing

40. **Browsing the episode list/detail pane never touches the player.** `App.tsx` holds `viewingEpisode` (plain `useState`) separately from `playerStore.episode` — clicking a row (`EpisodeList.tsx`'s `handleEpisodeClick`) only calls `onEpisodeView`, updating `viewingEpisode` and the URL; it never calls `setEpisode`/`setPlaying`. The *only* thing that changes what's loaded in the player is `App.tsx`'s `handlePlayEpisode`, wired to a Play/Pause button in `DetailPane.tsx` — toggles play/pause if `viewingEpisode` is already the player's episode, otherwise loads it fresh and starts it (interrupting whatever was playing, same as any podcast app). This means a listener can freely browse other episodes' details while something else keeps playing in the background. `EpisodeItem`'s row highlight (`isActive`) follows `viewingEpisode`; its EQ indicator (`isPlaying`) follows the player's actual episode — they can differ, on purpose.
41. **`DetailPane`'s Play/Pause button has a distinct `aria-label`** (`"Play episode"`/`"Pause episode"`) from its visible text (`"Play"`/`"Pause"`) — deliberately, because the player bar's own transport button also has accessible name `"Play"`/`"Pause"`, and once both are mounted simultaneously (the viewed episode is also the one loaded/playing), an identical accessible name on two different buttons is a real ambiguity, not just a test-locator nuisance (`getByRole('button', { name: 'Pause' })` resolving to 2 elements is exactly the bug this fixed — hit for real when adding e2e coverage for this feature).
42. **Deep links are one-directional URL syncing, not routing.** `App.tsx` parses `?episode=X&t=Y` once at boot (see `utils/shareUrl.ts` for the encode side); `EpisodeList.tsx` writes `?episode=` back via `history.replaceState` (never `pushState`) on every episode view. There is deliberately no `popstate` listener — since nothing ever calls `pushState`, there's no per-episode browser-history entry to go back/forward to, so this isn't a missing feature so much as a non-goal; verified empirically (`window.history.length` doesn't grow across episode switches). If `pushState`-based back/forward navigation is ever added, a `popstate` listener re-running the same boot-time deep-link resolution logic would be needed.
43. **Shared-timestamp precedence: the listener's own progress always wins once it exists.** `AudioPlayer.tsx`'s `resumeTimeFor` prefers `getEpisodeProgress(id)` (local saved position) over a shared link's `t` — a shared timestamp only applies the *first* time that episode is loaded with no prior local progress. This needs no explicit "already consumed" flag; once any real listening happens (or the episode finishes, which clears saved progress via `handleEnded`), the ordinary resume-position logic takes over naturally.
43a. **Resume position saves eagerly on tab-hide/close/disconnect, not just the periodic 5s tick.** `AudioPlayer.tsx` has a second effect (separate from the resume/cleanup effect above) that listens for `visibilitychange` (hidden only), `pagehide`, and `offline`, persisting `currentTimeRef.current` immediately when any fires (issue #85) — without this, a real network drop or closed tab could lose up to 5s of position, since the normal periodic save only writes when `timeUpdate` reports the position has moved ≥5s since the last write. Guarded by the same `endedRef` the cleanup effect already uses, so it won't resurrect a just-cleared position if the episode finished right before the tab was hidden. Testing note: isolate this from the periodic tick's own save (which already fires on the very first `timeUpdate` past 5s, since it starts counting from 0) by moving the position twice — once to "use up" the periodic save, then a second small move under the 5s threshold — before asserting only the eager path could be responsible for the final persisted value.
43b. **Playback loading/error/retry state lives in `playerStore`, driven by real `<audio>` events, and is surfaced on three independent Play buttons (player bar, mobile mini-bar/full overlay, DetailPane) — not a shared component.** `AudioPlayerView.tsx` listens for native `waiting`/`stalled` (→ `loading: true`), `playing` (→ clears both `loading` and `error`), and `error` (→ `error: true`, issues #82/#83). `setPlaying(false)` also clears `loading` in the store itself (not in a component) — pausing cancels whatever the browser was doing to fulfil a pending `play()`, so a stale "Buffering…" shouldn't linger after a deliberate pause. Retrying is a `retryNonce` counter (`retryPlayback()`), not an imperative function passed around — only `AudioPlayerView` holds the `<audio>` ref, but a listener might tap retry from `DetailPane` instead, so any button just bumps the counter and `AudioPlayerView` reacts to the value changing via its own effect (`retrySignal` prop) to actually call `audio.load()`/`play()`. Switching episodes calls `onReset` (clears both flags) so a stale error from a previous episode never bleeds into a freshly-loaded one. External-URL (`audio_type: 'url'`) episodes get a CORS-flavored hint in the error message (issue #84) — the browser gives no real way to distinguish a CORS block from a plain network failure, so this is a best-effort guess, not a diagnosis, mirrored in `EpisodeFormPanel.tsx`'s save-time duration-probe failure hint for admins.
43c. **Tests that render a real `<audio>` element and need `.src` to behave inertly must neutralize `setup.ts`'s global error-simulation patch, or issues #82/#83's real event wiring will fire unexpectedly.** `client/src/tests/setup.ts` patches `HTMLMediaElement.prototype.src`'s setter to dispatch an async `error` event on every assignment (`setTimeout(() => ..., 0)`) — added originally so `EpisodeFormPanel`'s duration-probing `await`s don't hang forever in jsdom, which never fires real media events on its own. Once `AudioPlayerView` started actually listening for `error` (issue #83), that same patch began flipping the player into its error/retry state in *any* test that awaits something (`userEvent`, `findBy*`, `waitFor`) after an episode loads — even tests with nothing to do with playback errors. `AudioPlayerView.test.tsx`, `AudioPlayer.test.tsx`, and `App.test.tsx` each re-override the `src` setter to a no-op at the top of the file (alongside their existing `play`/`pause`/`load` stubs) to opt back out of the automatic simulation; tests that specifically want to exercise the loading/error/resumed path fire `waiting`/`stalled`/`playing`/`error` on the `<audio>` element manually instead. `EpisodeFormPanel.test.tsx` was never affected — it already bypasses the prototype patch entirely via `vi.stubGlobal('Audio', FakeAudio)`, a full fake that isn't a real `HTMLMediaElement` instance.
43d. **Any e2e assertion checking the transport button's exact accessible name (`'Pause'` in particular) races against real playback errors on the seeded fixtures' stub URLs — this bit multiple files, not just one.** The `seededPage` fixture's episodes use stub external URLs (`https://example.com/...`) that a real browser can legitimately fire a native `error` event for at any time once loading starts (issue #83's real error-event wiring), whether or not `play()` was ever actually called. How much elapsed time a given test has before its assertion (a synchronous click vs. an animated overlay expand, e.g.) determines whether that race has resolved by the time the check runs — CI's Chromium and local Chromium don't necessarily lose the race at the same point either, so a test that's stable locally isn't guaranteed stable in CI (confirmed directly: `mobile.spec.ts`'s now-playing-overlay test passed locally twice in a row, then failed in CI on the very next run, on a *different* assertion than the one first caught locally in `sharing.spec.ts`). Two mitigation patterns, pick whichever matches what the test actually cares about: (1) `e2e/tests/sharing.spec.ts`'s deep-link tests only care about "didn't auto-play," so they assert the *absence* of `'Pause'` rather than the *presence* of `'Play'` — robust either way. (2) `e2e/tests/player.spec.ts` and `mobile.spec.ts` care about "a real, tappable central control rendered," so they use `locator.or(...)` to accept either `'Pause'`/`'Retry playback'` — both prove the click did something real. Don't add a third occurrence of this class of flake without one of these two patterns; grep for `'Pause'` in `e2e/tests/` before adding a new assertion on it.
43e. **The buffering/error status line (`client/src/components/PlaybackStatusLine.tsx`) is always mounted, never conditionally rendered — this is load-bearing, not a style choice.** An earlier version conditionally rendered the "Buffering…"/error `<p>` only when there was something to show, which meant the description/pill badges below it in `DetailPane` (and the progress bar/transport controls below it in `AudioPlayerView`'s bar and full overlay) visibly jumped down when buffering started and back up when it ended — a real, reported UX bug. The fix: `PlaybackStatusLine` always renders a `role="status"` element with a size-matched `min-h` (`getPlaybackStatus()` in `client/src/utils/playbackStatus.ts` returns the message/tone, or `null`), fading between invisible and visible via `opacity` instead of mounting/unmounting, with a single space as fallback content so the reserved height never depends on there being real text. Centralizing the message text in `getPlaybackStatus()` also fixed a latent inconsistency — the player bar and `DetailPane` used to have slightly different wording for the same error. **The `size` prop (`'xs'` for the desktop bar, `'sm'` elsewhere) exists specifically to avoid a real Tailwind footgun**: two font-size utility classes on the same element (e.g. a hardcoded `text-sm` plus a caller-supplied `text-xs` override) don't resolve by DOM/JSX order — Tailwind's generated stylesheet order decides which wins, unpredictably. Bundling size+matching-min-height as a single prop sidesteps that instead of relying on className overrides.
44. **Server-rendered Open Graph tags for shared links only exist in production's single-container mode.** `server/src/app.ts`'s crawler-detection `onRequest` hook (backing `server/src/utils/crawler.ts`) is registered only inside the `if (clientDist && fs.existsSync(clientDist))` block — inert in dev's split client/server topology, active only when `SERVE_CLIENT=true`. It's scoped to exactly `/` (checked via `req.url.split('?')[0] !== '/'`) so a crawler-UA-flavored request to any other route (e.g. an API endpoint) can't be accidentally short-circuited into an OG-HTML response. `og:image` is resolved to an absolute URL (`${req.protocol}://${req.hostname}${path}`) before being emitted — cover art paths are stored/returned as site-relative paths, and the Open Graph spec requires an absolute `og:image` or link-preview unfurlers silently show no image at all (a real bug caught in a pre-production review, not a hypothetical).
45. **`og:url`'s origin trusts the request's `Host` header by default — an optional `PUBLIC_ORIGIN` env var pins it instead (issue #53).** `req.hostname` is attacker-controllable input (the `Host`/`X-Forwarded-Host` header), reflected — HTML-escaped, so not script-injectable — into the crawler-served OG response. This was a real (low-severity, escaped, metadata-only) open-redirect-flavored issue when the response also included a `<meta http-equiv="refresh">` pointing at that same attacker-controlled origin; the refresh tag has since been removed entirely (it was genuinely non-essential — bots read `<meta>` tags, they don't follow refreshes — so removing it was strictly safer, not a feature cut). `server/src/utils/crawler.ts`'s `resolveConfiguredOrigin` validates `process.env.PUBLIC_ORIGIN` (must be a bare `scheme://host[:port]`, no path, no trailing slash) and, if set and well-formed, `app.ts`'s crawler hook uses it instead of `${req.protocol}://${req.hostname}` — malformed or unset values fall straight back to the request-derived origin rather than crashing on a typo'd env var.
46. **`e2e/tests/sharing.spec.ts`'s OG-tag crawler tests are gated on `!process.env.BASE_URL`, not `!process.env.CI`.** Per gotcha #44, crawler OG rendering only exists in the production single-container build — CI's `e2e` job always explicitly sets `BASE_URL=http://localhost:3000` (the running production image) while local `make e2e` never sets it (defaults to the dev client's `:5173`), so that's a direct, reliable signal for "is the crawler hook even reachable here" rather than a proxy for it (issue #51). The two share-flow tests (deep-link round-trip through the real UI) run everywhere and don't need this gate.

---

## Branching & Workflow

`main` is the production branch — every push to it deploys automatically (see CI/CD below). **Do not push directly to `main`.** All work happens on `dev` (or a branch off `dev`), then gets promoted to `main` via a PR that the maintainer reviews and merges by hand.

This is convention, not a technical enforcement: GitHub branch protection rules require a paid plan (or a public repo) and this repo is private on the Free plan, so `main` isn't actually lockable via GitHub's API today. Treat it as protected anyway. If a bad push to `main` ever happens, `git reset --hard origin/main` on the working branch and re-derive from there — don't try to force-fix forward under pressure.

**Promotion is a squash-merge.** After a PR merges, `dev`'s pre-merge commit history is no longer an ancestor of `main` (GitHub squashes to one commit). Sync `dev` back with `git checkout dev && git reset --hard origin/main && git push --force origin dev` — safe here since `dev`'s content is already fully folded into the squash commit on `main`, nothing is lost.

## CI/CD

`.github/workflows/ci-cd.yml` triggers on push to `main` or `dev`, and on PRs targeting `main`. Commits touching only `**.md` files (`paths-ignore`) skip the entire pipeline — no lint/test/build/e2e/deploy — since there's no code to validate. A commit mixing docs with code changes still runs everything normally (`paths-ignore` only skips when *every* changed file matches).

Jobs run in this order:

1. `lint` — ESLint on server + client (parallel with `test`/`typecheck`)
2. `test` — Vitest server (166 tests) + client (334 tests + 3 skipped)
3. `typecheck` — `tsc --noEmit` on client
4. `build` — builds the root `Dockerfile` image, pushes to GHCR (needs lint+test+typecheck)
5. `e2e` — runs the pushed image as a container, waits on `/api/settings`, runs Playwright (48 tests, including 2 production-image-only OG-tag crawler tests that BASE_URL-gate-skip everywhere else) against it over HTTP (not the dev stack), uploads report/screenshots as artifacts on failure (needs build). **Only runs on `main` pushes or PRs targeting `main`** — plain pushes to `dev` skip it, since it's the slow/costly stage and `dev`'s safety net is meant to be fast (lint/test/build on every commit). Capped at `timeout-minutes: 15` (healthy runs take ~4-6 min) so a genuine hang (browser/network stall) fails fast instead of silently running for hours. Invoked directly as `npx playwright test`, not `npm test` — the npm wrapper was found to buffer all output until the child process exits normally, which hid a real ~20-minute cascading test failure behind what looked like total silence.
6. `deploy` — only on `main`; SSHes to the production Droplet, pulls the new image **by digest** (not tag — see below), restarts the container, health-checks it (needs build+e2e)

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

Reference specs and plans in `planning/` for historical context on architectural decisions. Notable:
- `2026-05-05-podcast-webapp-design.md` — Original design spec
- `2026-05-06-playwright-e2e-design.md` — E2E testing design
- `2026-07-10-deploy-do-gitlab.md` / `2026-07-10-do-droplet-setup.md` — Production deployment setup (GitHub Actions + DigitalOcean Droplet)

---

## When Adding Features

- **New API endpoint:** Add a Fastify plugin in `server/src/routes/` (or `routes/admin/`), register it in `server/src/app.ts`.
- **New DB column on an existing table:** Add a guarded `ALTER TABLE ... ADD COLUMN`, checked via `PRAGMA table_info`, to `server/src/db/migrate.ts` (see Database gotchas — this must stay additive/nullable, no backup/rollback tooling exists yet).
- **New DB table:** Add `CREATE TABLE IF NOT EXISTS` to `server/src/db/migrate.ts`. Add corresponding interface to `server/src/types.ts` and `client/src/types.ts`.
- **New client component:** Create in `client/src/components/` (listener) or `client/src/pages/admin/` (admin). Export default. Add test in `client/src/tests/`. Remember both light and dark Tailwind variants on every color class.
- **New E2E test:** Add to `e2e/tests/`. Use `seededPage` or `adminPage` fixtures from `e2e/fixtures.ts`. If it needs the browser to decode real audio, use `test-audio.wav` (real, decodable) not `test-audio.mp3` (synthetic stub) — and be aware real audio decoding is unreliable in CI regardless (see Testing gotchas).
- **New env var:** Add to `.env.example`, document in `README.md`, and read in `server/src/app.ts` or the relevant route. **If production needs it (not just local dev), also add it to the `deploy` job's `docker run` invocation in `.github/workflows/ci-cd.yml`** — a value documented in `.env.example`/README is not automatically passed to the production container; only what's explicitly listed in that `docker run` command reaches it. Missing this step is a real, already-happened mistake, not a hypothetical — see gotcha #37b.
