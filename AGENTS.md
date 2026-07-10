# AGENTS.md — Ear Candy

This document captures non-obvious knowledge about the Ear Candy codebase to help future agents work effectively without trial-and-error discovery.

---

## Project Overview

Ear Candy is a self-hostable podcast webapp. Each deployment hosts a single podcast. Listeners browse seasons/episodes and play audio in the browser. Admins manage all content through a built-in web interface.

**Stack:**
- **Server:** Fastify 4 + SQLite (`better-sqlite3`) + TypeScript (ES modules)
- **Client:** React 19 + Vite 5 + Tailwind CSS + Zustand
- **Auth:** Single admin password stored as a bcrypt hash in an env var
- **E2E:** Playwright
- **Deployment:** Docker Compose (dev) or multi-stage Dockerfile (production)

---

## Essential Commands

All commands should be run from the repo root unless noted.

| Command | Description |
|---------|-------------|
| `make setup PASSWORD=yourpassword` | Generate `.env` file with bcrypt hash. Fails if `.env` already exists. |
| `make up` | Start dev stack (`docker compose up --build`). Server on `:3001`, client on `:5173`. |
| `make down` | Stop dev stack. |
| `make logs` | Tail dev stack logs. |
| `make test` | Run server unit tests (`cd server && npm test`) then client unit tests (`cd client && npm test`). |
| `make lint` | Lint server (`cd server && npm run lint`) then client (`cd client && npm run lint`). |
| `make e2e` | Run Playwright E2E tests (`cd e2e && npm test`). **Requires `make up` first.** |
| `make e2e-ui` | Open Playwright UI mode. |
| `make build-prod` | Build production Docker image. |
| `make up-prod` | Start production stack (`docker compose -f docker-compose.prod.yml up -d`). |

**Per-package commands:**

- **Server:** `cd server && npm run dev` (tsx watch), `npm test` (vitest), `npm run lint` (eslint)
- **Client:** `cd client && npm run dev` (vite), `npm test` (vitest + jsdom), `npm run lint` (eslint), `npm run typecheck` (tsc --noEmit)
- **E2E:** `cd e2e && npm test` (playwright), `npm run test:ui` (playwright --ui)

---

## Architecture & Data Flow

### Three-Tier Structure

```
Client (React + Vite)  →  Server (Fastify + SQLite)  →  SQLite DB + File Uploads
        :5173                    :3001                    data/db.sqlite
                                                          data/uploads/
```

In **dev**, client and server run as separate Docker services. In **production**, the server serves the built client static files from `dist/client/` (enabled by `SERVE_CLIENT=true`).

### Server Architecture

- **Entry point:** `server/src/server.ts` — creates app, listens on `PORT`, handles SIGTERM/SIGINT shutdown.
- **App factory:** `server/src/app.ts` — `buildApp(opts)` creates a Fastify instance, wires plugins (cookie, multipart, static), registers all routes, and decorates `app.db`.
- **Database:** `better-sqlite3` with WAL mode and foreign keys. Initialized in `server/src/db/index.ts`, schema created in `server/src/db/migrate.ts`.
- **Routes:** All routes are Fastify plugin async functions registered under `/api` prefix. Split into public (`routes/`) and admin (`routes/admin/`) directories.
- **Auth:** `requireAdmin` preHandler checks for a signed `admin_session` cookie. Cookie secret comes from `COOKIE_SECRET` env var. Admin password verified via bcrypt against `ADMIN_PASSWORD_HASH`.
- **File uploads:** `@fastify/multipart` handles uploads to `data/uploads/`. Served statically at `/audio/`. Max file size: 500MB.

### Client Architecture

- **Entry point:** `client/src/main.tsx` → renders `App.tsx`.
- **App.tsx:** Root component with simple view routing (`'player' | 'admin-login' | 'admin'`). No router library — just state-driven conditional rendering.
- **State management:** Zustand in `client/src/store/playerStore.ts` for audio player state (episode, playing, currentTime, duration, speed).
- **API layer:** `client/src/api.ts` — typed fetch wrappers. Public endpoints use plain fetch; admin endpoints use `credentials: 'include'` for cookie auth.
- **Theming:** `useTheme` hook reads/writes `localStorage` key `'theme'` and toggles `.dark` class on `<html>`. Accent color is set as CSS variable `--accent` on `:root`.
- **Styling:** Tailwind CSS with `darkMode: 'class'`. Color scheme is always dark (`bg-zinc-950 text-zinc-100` on body), but light mode support exists via the `.dark` class toggle.

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
│   │   │   └── migrate.ts      # Schema creation + seed settings row
│   │   ├── routes/
│   │   │   ├── settings.ts     # GET /api/settings
│   │   │   ├── seasons.ts        # GET /api/seasons (visible only)
│   │   │   ├── episodes.ts       # GET /api/episodes, /api/episodes/:id (visible only)
│   │   │   └── admin/
│   │   │       ├── auth.ts       # POST /api/admin/login, logout, session
│   │   │       ├── seasons.ts    # CRUD seasons
│   │   │       ├── episodes.ts   # CRUD episodes
│   │   │       ├── upload.ts     # POST /api/admin/upload
│   │   │       └── settings.ts   # PUT/PATCH /api/admin/settings
│   │   └── utils/
│   │       └── duration.ts     # parseDuration, formatDuration
│   ├── tests/                  # Vitest tests (node env, globals)
│   │   └── helpers.ts          # buildTestApp(), buildTestDb()
│   └── data/                   # SQLite DB + uploads (gitignored)
│
├── client/
│   ├── src/
│   │   ├── App.tsx             # Root + view routing
│   │   ├── api.ts              # Fetch wrappers
│   │   ├── types.ts            # Shared TS interfaces (mirrors server)
│   │   ├── index.css           # Tailwind directives + CSS variables
│   │   ├── store/
│   │   │   └── playerStore.ts  # Zustand player state
│   │   ├── hooks/
│   │   │   └── useTheme.ts     # Dark mode + accent color
│   │   ├── components/         # Listener UI (AppShell, AudioPlayer, etc.)
│   │   ├── pages/
│   │   │   ├── AdminLogin.tsx
│   │   │   └── admin/          # AdminLayout, EpisodeManager, etc.
│   │   └── tests/              # Vitest tests (jsdom env, globals)
│   │       └── setup.ts        # localStorage mock + jest-dom
│   ├── vite.config.ts          # Vite + proxy /api and /audio to server
│   └── tailwind.config.ts      # darkMode: 'class'
│
├── e2e/
│   ├── fixtures.ts             # Custom Playwright fixtures (seededPage, adminPage)
│   ├── playwright.config.ts    # workers: 1, chromium only
│   └── tests/                  # E2E specs
│
├── docs/superpowers/           # Design specs and plans
├── scripts/hash-password.sh  # bcrypt hash helper
├── Makefile                  # Primary dev commands
├── docker-compose.yml        # Dev stack
├── docker-compose.prod.yml   # Production stack
└── Dockerfile                # Multi-stage production build
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
- **CSS classes:** Tailwind utility classes. Accent color uses `bg-[var(--accent)]` for dynamic theming. Dark mode base is `bg-zinc-950 text-zinc-100`.
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
- **Setup file:** `client/src/tests/setup.ts` mocks `localStorage` (Node v22+ native localStorage breaks without a valid file path) and imports `@testing-library/jest-dom`.
- **Pattern:** Mock `fetch` and API module imports with `vi.mock()`. Mock `HTMLMediaElement` methods for audio player tests. Reset Zustand store state in `beforeEach`.
- **Important:** `vi.clearAllMocks()` wipes `HTMLMediaElement` mocks, so re-apply them after clearing.

### E2E Tests (`e2e/tests/`)

- **Runner:** Playwright with `workers: 1` (tests share a real database, must run serially).
- **Base URL:** `http://localhost:5173` (dev client). **Requires `make up` running.**
- **Fixtures:**
  - `seededPage`: Logs in via API, seeds a season + 2 episodes, navigates to `/`, then tears down (deletes season, resets settings). Use for listener UI tests.
  - `adminPage`: Logs in via browser request, clicks admin gear, navigates to admin panel. Use for admin panel tests.
- **Auth password:** `process.env.TEST_ADMIN_PASSWORD` or defaults to `'changeme'`.
- **Color scheme:** `theme.spec.ts` uses `test.use({ colorScheme: 'light' })` to test light mode.

---

## Important Gotchas

### Environment & Setup

1. **`.env` is required for dev.** Run `make setup PASSWORD=...` to generate it. It creates `ADMIN_PASSWORD_HASH` (bcrypt) and `COOKIE_SECRET`. The Makefile uses Docker to run bcrypt hashing — no local Node needed.
2. **Production refuses to start without `COOKIE_SECRET`.** `server/src/app.ts` throws if `NODE_ENV=production` and `COOKIE_SECRET` is missing.
3. **Server port in dev is 3001, client is 5173.** Vite proxies `/api` and `/audio` to the server. In production, everything is on port 3000.

### Database

4. **SQLite schema has no migrations framework.** `migrate.ts` runs `CREATE TABLE IF NOT EXISTS` on every startup. Schema changes must be manual or added to `migrate.ts` with conditional logic.
5. **Foreign keys are ON.** Deleting a season cascades to its episodes (see `ON DELETE CASCADE` in `episodes` table).
6. **WAL mode is enabled.** `db.pragma('journal_mode = WAL')`. Safe for single-process use; for multi-process, consider WAL limitations.
7. **Settings table has exactly one row.** `migrate.ts` inserts a default row if `COUNT(*) = 0`. The `DELETE FROM settings` + `INSERT` pattern in `admin/settings.ts` preserves this invariant.

### Auth

8. **Admin session is a signed cookie.** `@fastify/cookie` with `signed: true`. The cookie value is literally `'authenticated'` — the signature is what matters. `requireAdmin` unsigns and checks validity.
9. **No user model.** There is no users table. Only one admin password hash, stored in `ADMIN_PASSWORD_HASH` env var.

### API & Routes

10. **Public episode endpoints filter by visibility.** `GET /api/episodes` and `GET /api/episodes/:id` both join with `seasons` and filter `e.hidden=0 AND s.hidden=0`. Admin endpoints return all rows.
11. **PATCH vs PUT on episodes:** `PUT` fully replaces all fields (except defaults). `PATCH` dynamically builds `SET` clauses from the request body. Both always update `updated_at = datetime('now')`.
12. **Boolean serialization:** The DB stores `hidden` as `INTEGER` (0/1). In `PATCH`/`PUT` handlers, `hidden` is explicitly converted: `hidden ? 1 : 0` before writing to DB.
13. **Upload endpoint returns a path string.** `POST /api/admin/upload` returns `{ path: "/audio/{uuid}.ext" }`. The client stores this path in `audio_path` and sets `audio_type: 'upload'`.

### Client

14. **No React Router.** Navigation is entirely state-driven in `App.tsx` (`view: 'player' | 'admin-login' | 'admin'`). Admin panel has its own tab state (`adminTab: 'episodes' | 'settings'`).
15. **Accent color is a CSS variable.** `useTheme` sets `--accent` on `:root`. Components reference it via `bg-[var(--accent)]`. The default is `#5a3ef5`.
16. **Dark mode class toggling.** `useTheme` adds/removes `.dark` on `<html>`. Tailwind's `darkMode: 'class'` makes dark variants active. The base body styles are already dark, so light mode is effectively "no dark class".
17. **Audio player uses a hidden `<audio>` element.** `AudioPlayer.tsx` creates an `<audio>` ref and controls it via `audioRef.current.play()` / `.pause()`. Time updates come from `onTimeUpdate` events.
18. **Zustand store is module-level.** Import `usePlayerStore` and call `.setState()` or `.getState()` directly in tests. Wrap in `act()` when rendering is involved.

### Testing

19. **Server tests use `app.inject()`, not HTTP.** No server port binding. Fastify's `inject()` simulates HTTP requests.
20. **Client tests need `localStorage` mock.** Node v22+ has a native `localStorage` that throws without a file path. `setup.ts` replaces it with an in-memory mock.
21. **E2E tests require the dev stack running.** `make e2e` does NOT start services. Run `make up` first. Tests hit the real database, so `workers: 1` is mandatory.
22. **E2E fixtures use API request context for setup, browser context for admin.** `seededPage` uses `request.post()` (isolated API context) to seed data. `adminPage` uses `page.request.post()` (shares browser cookie jar) to log in.
23. **E2E tests clean up after themselves.** `seededPage` fixture deletes the created season and resets settings in `finally`. Admin tests use `afterEach` to delete the last season.

### Docker & Deployment

24. **Dev Dockerfiles are minimal.** `server/Dockerfile.dev` and `client/Dockerfile.dev` just `npm install` and copy files. The compose file mounts source volumes for hot reload.
25. **Production Dockerfile is multi-stage.** Stage 1 builds client, Stage 2 builds server TS, Stage 3 runs server with compiled JS and static client files. Native addons (bcrypt, better-sqlite3) compile in the runner stage because Alpine needs `python3 make g++`.
26. **Production compose mounts `./data` for persistence.** Without this, the SQLite DB and uploads are lost on container restart.
27. **nginx in production compose serves the client.** The `docker-compose.prod.yml` uses nginx to serve the built client and proxy `/api/` and `/audio/` to the server. The monolithic `Dockerfile` (root level) builds everything into one image where the server serves the client directly.
28. **Bcrypt hashes contain `$` characters.** When passing `ADMIN_PASSWORD_HASH` or `COOKIE_SECRET` to `docker run` in shell scripts (e.g., GitHub Actions deploy), always use single quotes (`'...'`) to prevent bash from interpreting `$` as variable expansion. Double quotes will corrupt the hash and login will fail silently.

### Linting

28. **Both server and client use `typescript-eslint` recommended.** Server config is minimal. Client adds `eslint-plugin-react` and `eslint-plugin-react-hooks`.
29. **`argsIgnorePattern: '^_'`** is configured for `@typescript-eslint/no-unused-vars` in both packages.

---

## Design Documents

Reference specs in `docs/superpowers/specs/` and plans in `docs/superpowers/plans/` for historical context on architectural decisions. Notable:
- `2026-05-05-podcast-webapp-design.md` — Original design spec
- `2026-05-06-playwright-e2e-design.md` — E2E testing design

---

## When Adding Features

- **New API endpoint:** Add a Fastify plugin in `server/src/routes/` (or `routes/admin/`), register it in `server/src/app.ts`.
- **New DB table:** Add `CREATE TABLE IF NOT EXISTS` to `server/src/db/migrate.ts`. Add corresponding interface to `server/src/types.ts` and `client/src/types.ts`.
- **New client component:** Create in `client/src/components/` (listener) or `client/src/pages/admin/` (admin). Export default. Add test in `client/src/tests/`.
- **New E2E test:** Add to `e2e/tests/`. Use `seededPage` or `adminPage` fixtures from `e2e/fixtures.ts`.
- **New env var:** Add to `.env.example`, document in README, and read in `server/src/app.ts` or relevant route.
