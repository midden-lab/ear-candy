# Ear Candy

A self-hostable podcast webapp. Each deployment hosts a single podcast. Listeners browse seasons and episodes and play audio in the browser. Admins manage all content through a built-in web interface.

## Stack

- **Server**: Fastify 5 + SQLite (via `better-sqlite3`) + TypeScript
- **Client**: React 19 + Vite 5 + Tailwind CSS + Zustand
- **Auth**: Single admin password stored as a bcrypt hash in an environment variable
- **Storage**: SQLite database + local audio/image file uploads, both in `server/data/`

---

## Development

### Prerequisites

- Docker and Docker Compose

### Quickest path: Makefile

```bash
make setup PASSWORD=yourpassword   # generates .env (bcrypt hash + cookie secret), Docker-only, no local Node needed
make up                            # docker compose up --build
```

Run `make help` for the full list of shortcuts (`test`, `lint`, `e2e`, `e2e-ui`, `build-prod`, `up-prod`, ...).

### Manual path

If you'd rather not use the Makefile:

**1. Generate a password hash**

```bash
cd server
node -e "
const bcrypt = require('bcrypt');
bcrypt.hash('your-password', 12).then(h => console.log(h));
"
```

Or use the helper script (requires Node + bcrypt installed locally):

```bash
./scripts/hash-password.sh your-password
```

**2. Set environment variables**

Create a `.env` file in the project root:

```env
ADMIN_PASSWORD_HASH=$2b$12$...   # output from step 1
COOKIE_SECRET=a-long-random-string
```

**3. Start**

```bash
docker compose up
```

| Service | URL |
|---------|-----|
| Listener UI | http://localhost:5173 |
| API | http://localhost:3001/api |

Both services hot-reload on file changes.

---

## Production

### Build and run

```bash
docker compose -f docker-compose.prod.yml up -d
```

This builds and runs the root `Dockerfile` — a single multi-stage image where the Fastify server serves the built client directly (`SERVE_CLIENT=true`) on port 3000, no separate nginx container involved. Native addons (bcrypt, better-sqlite3) are compiled for Alpine Linux in an intermediate build stage; the final image ships only the compiled output, no compilers.

The live production deployment (via GitHub Actions, see `.github/workflows/ci-cd.yml`) doesn't use `docker-compose.prod.yml` directly — it builds the same `Dockerfile`, pushes it to GHCR, and runs it with a plain `docker run` on the target host. Functionally equivalent; `docker-compose.prod.yml` is the convenient local/manual equivalent of that same image.

### Required environment variables

| Variable | Description |
|----------|-------------|
| `ADMIN_PASSWORD_HASH` | bcrypt hash of the admin password (rounds ≥ 10 recommended) |
| `COOKIE_SECRET` | Secret used to sign session cookies — use a long random string |

Both are required; the server will refuse to start in production if either is missing.

### Optional environment variables

| Variable | Description |
|----------|-------------|
| `PUBLIC_ORIGIN` | Pins the origin (`scheme://host[:port]`, no trailing slash) used in Open Graph preview tags served to link-preview crawlers, instead of trusting the request's `Host` header. Fine to leave unset for most deployments. |
| `TRUSTED_PROXY_IPS` | Comma-separated IPs Fastify trusts to set `X-Forwarded-For` (your reverse proxy's address, as seen from inside the app's own network namespace). Defaults to loopback only (`127.0.0.1,::1`). If your reverse proxy runs on the host while the app runs in a container, this is likely your Docker bridge gateway address, not loopback — check with `docker network inspect bridge`. |
| `GEOIP_DB_PATH` | Path to a local `.mmdb` GeoIP country database, used to resolve listener country for the analytics dashboard's geography breakdown. Optional — analytics work fully without it, the country breakdown is just empty until it's set. Run `scripts/fetch-geoip-db.sh [path]` to download a free, no-signup-required database (DB-IP's "IP to Country Lite", CC BY 4.0 — attribute DB-IP.com wherever the country data is shown). Re-run that script periodically (roughly monthly) to keep the database current; nothing does this automatically. |

### Data persistence

Mount `./data` to persist the SQLite database and uploaded audio files across restarts. The production compose file does this automatically:

```yaml
volumes:
  - ./data:/app/data
```

Back up the `data/` directory to preserve all podcast content.

---

## Admin interface

Navigate to the listener UI and click the gear icon (bottom of the left rail) to reach the admin login page.

From the admin panel you can:

- **Episodes tab**: Create and manage seasons and episodes, set episode metadata (guests, tags, publish date, audio source, cover art). Episode duration is detected automatically from the audio file/URL — no manual entry.
- **Settings tab**: Update the podcast name, a separate browser-tab title (falls back to the podcast name if unset), tagline, description, accent color, site favicon, and analytics preferences (see below).
- **Analytics tab**: Traffic and episode-listening dashboard — see [Analytics](#analytics) below.

Audio can be provided as an external URL or uploaded directly through the episode form; the same is true for episode cover art (resized to thumbnail + detail sizes automatically) and the site favicon (PNG/ICO only).

---

## Analytics

Ear Candy includes first-party, self-hosted analytics — page views, episode plays/completions, and lightweight audience-shape breakdowns (country, device/browser/OS, referrer). Everything is stored in your own SQLite database; nothing is sent to a third party, and no external account is required for it to work.

It's **on by default** — a fresh deployment shows working analytics immediately, since the data never leaves your host either way. Two independent toggles are available from the admin Settings tab:

- **Enable analytics** — turns data collection off entirely if you'd rather not collect anything, even locally.
- **Track returning listeners** — uses a persistent, random, non-identifying id (stored in the listener's own browser) to distinguish new vs. returning visits in the dashboard. When off, a fresh id is used per visit instead, and analytics still work fully — you just won't get the new-vs-returning split.

Country-level geography is optional and degrades gracefully: without a `.mmdb` database configured (see `GEOIP_DB_PATH` above), the country breakdown is simply empty — nothing else is affected.

**Setting it up:** both `docker-compose.prod.yml` and the GitHub Actions `deploy` job (`.github/workflows/ci-cd.yml`) already point `GEOIP_DB_PATH` at the same conventional location — `/app/data/geoip/dbip-country-lite.mmdb` inside the container, i.e. `<your data dir>/geoip/dbip-country-lite.mmdb` on the host (the same bind-mounted directory that holds `db.sqlite` and `uploads/`). Setting the env var alone isn't enough, though — a file also has to actually exist there. On any host with SSH access to where the container's data directory lives:
```bash
scripts/fetch-geoip-db.sh <your-data-dir>/geoip/dbip-country-lite.mmdb
```
run it locally against a bind-mounted volume, or copy the script up and run it directly on the host (same pattern as the one-off maintenance scripts in `server/scripts/`). Re-run it periodically (roughly monthly) — nothing does this automatically. If you're deploying your own fork via a different pipeline than this repo's `ci-cd.yml`, make sure whatever starts your production container also sets `GEOIP_DB_PATH` — a new env var doesn't take effect just because a file appears on disk; the running container has to be told where to look at start time (see issue #106, which is exactly this mistake happening once already).

**Known limitation:** raw analytics events currently accumulate indefinitely — there's no built-in pruning/retention policy in this version. This is fine at small-to-moderate scale, but worth knowing if you're running a very high-traffic deployment for a long time. Tracked in [issue #102](https://github.com/midden-lab/ear-candy/issues/102).

Listeners can toggle light/dark mode via the theme badge — dark is the default.

---

## API

All public endpoints are under `/api`. Admin endpoints require a valid session cookie (obtained via `POST /api/admin/login`).

### Public

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Liveness/health check |
| `GET` | `/api/settings` | Podcast metadata |
| `GET` | `/api/seasons` | All visible seasons, ordered by number |
| `GET` | `/api/episodes` | All visible episodes; accepts `?season_id=N` |
| `GET` | `/api/episodes/:id` | Single visible episode |

### Admin

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/login` | Authenticate; sets session cookie |
| `POST` | `/api/admin/logout` | Clear session cookie |
| `GET` | `/api/admin/session` | Check whether the current session is authenticated |
| `POST/PUT/PATCH/DELETE` | `/api/admin/seasons/:id` | Season CRUD |
| `POST/PUT/PATCH/DELETE` | `/api/admin/episodes/:id` | Episode CRUD |
| `POST` | `/api/admin/upload` | Upload an audio file |
| `POST` | `/api/admin/upload/image` | Upload episode cover art (returns thumb + detail WebP paths) |
| `POST` | `/api/admin/upload/favicon` | Upload the site favicon (PNG/ICO only) |
| `PUT/PATCH` | `/api/admin/settings` | Update podcast settings |

---

## Project structure

```
ear-candy/
├── server/
│   ├── src/
│   │   ├── app.ts              # Fastify app factory
│   │   ├── server.ts           # Entry point
│   │   ├── auth.ts             # requireAdmin preHandler
│   │   ├── types.ts            # Shared TypeScript types
│   │   ├── db/
│   │   │   ├── index.ts        # DB initialisation
│   │   │   └── migrate.ts      # Schema creation + guarded ALTER TABLE migrations
│   │   ├── routes/
│   │   │   ├── health.ts
│   │   │   ├── settings.ts
│   │   │   ├── seasons.ts
│   │   │   ├── episodes.ts
│   │   │   └── admin/          # Auth, CRUD, audio/image/favicon upload, settings
│   │   └── utils/               # duration parsing, media path validation
│   ├── scripts/                 # One-off maintenance scripts (see CLAUDE.md)
│   ├── tests/
│   ├── data/                   # SQLite DB + uploaded audio/images (gitignored)
│   └── Dockerfile.dev
├── client/
│   ├── src/
│   │   ├── App.tsx             # Root component + view routing
│   │   ├── api.ts              # Typed fetch client
│   │   ├── types.ts            # Shared TypeScript types
│   │   ├── store/
│   │   │   └── playerStore.ts  # Zustand audio player state
│   │   ├── hooks/
│   │   │   ├── useTheme.ts       # Dark/light mode + accent color/contrast
│   │   │   └── useBreakpoint.ts  # Responsive layout hook
│   │   ├── utils/
│   │   │   └── color.ts        # Accent-color contrast computation
│   │   ├── components/         # Listener UI: player, episode list/detail, cover art, theme toggle, etc.
│   │   └── pages/               # AdminLogin, admin/ layout + pages
│   └── Dockerfile.dev
├── scripts/
│   ├── hash-password.sh         # bcrypt password hash helper
│   └── downsample-audio-dir.sh  # local tool: downsample a directory of audio files (see CLAUDE.md)
├── docker-compose.yml          # Dev
├── docker-compose.prod.yml     # Production (builds/runs the root Dockerfile)
└── Dockerfile                  # The actual production image (multi-stage; server serves client directly)
```

Note: `client/Dockerfile` and `client/nginx.conf` also exist in the repo but are unused — they describe an alternate nginx-fronted deployment that nothing currently builds or runs. Production uses the root `Dockerfile` only.

---

## CI/CD

`.github/workflows/ci-cd.yml` runs on push to `main` or `dev`, and on PRs targeting `main`. Doc-only commits (touching only `*.md` files) skip the whole pipeline.

1. `lint` — ESLint on server + client
2. `test` — Vitest server (node) + client (jsdom)
3. `typecheck` — `tsc --noEmit` on client
4. `build` — builds the production Docker image and pushes it to GHCR
5. `e2e` — runs the built image, waits for it to be healthy, then runs Playwright against it. Only on `main` pushes or PRs targeting `main` — `dev` pushes get the fast lint/test/build safety net without the slower e2e stage.
6. `deploy` (main only) — SSHes to the production host, pulls the new image, and restarts the container

All work happens on `dev`, promoted to `main` via a reviewed PR — see `CLAUDE.md` for the full workflow convention.

## Testing

```bash
# Server (100 tests)
cd server && npm test

# Client (200 tests + 2 skipped)
cd client && npm test

# E2E (43 tests, requires the dev stack running — see `make e2e`)
cd e2e && npm test
```

Lint:

```bash
cd server && npm run lint
cd client && npm run lint
```
