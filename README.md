# Ear Candy

A self-hostable podcast webapp. Each deployment hosts a single podcast. Listeners browse seasons and episodes and play audio in the browser. Admins manage all content through a built-in web interface.

## Stack

- **Server**: Fastify 4 + SQLite (via `better-sqlite3`) + TypeScript
- **Client**: React 19 + Vite 5 + Tailwind CSS + Zustand
- **Auth**: Single admin password stored as a bcrypt hash in an environment variable
- **Storage**: SQLite database + local audio file uploads, both in `server/data/`

---

## Development

### Prerequisites

- Docker and Docker Compose

### 1. Generate a password hash

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

### 2. Set environment variables

Create a `.env` file in the project root:

```env
ADMIN_PASSWORD_HASH=$2b$12$...   # output from step 1
COOKIE_SECRET=a-long-random-string
```

### 3. Start

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

The client is served by nginx on port 80, which also proxies `/api/` and `/audio/` to the server container. The server container compiles native addons (bcrypt, better-sqlite3) for Alpine Linux at build time.

### Required environment variables

| Variable | Description |
|----------|-------------|
| `ADMIN_PASSWORD_HASH` | bcrypt hash of the admin password (rounds ≥ 10 recommended) |
| `COOKIE_SECRET` | Secret used to sign session cookies — use a long random string |

Both are required; the server will refuse to start in production if either is missing.

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

- **Episodes tab**: Create and manage seasons and episodes, set episode metadata (guests, tags, publish date, audio source)
- **Settings tab**: Update the podcast name, tagline, description, and accent color

Audio can be provided as an external URL or uploaded directly through the episode form.

---

## API

All public endpoints are under `/api`. Admin endpoints require a valid session cookie (obtained via `POST /api/admin/login`).

### Public

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/settings` | Podcast metadata |
| `GET` | `/api/seasons` | All visible seasons, ordered by number |
| `GET` | `/api/episodes` | All visible episodes; accepts `?season_id=N` |
| `GET` | `/api/episodes/:id` | Single visible episode |

### Admin

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/login` | Authenticate; sets session cookie |
| `POST` | `/api/admin/logout` | Clear session cookie |
| `POST/PUT/PATCH/DELETE` | `/api/admin/seasons/:id` | Season CRUD |
| `POST/PUT/PATCH/DELETE` | `/api/admin/episodes/:id` | Episode CRUD |
| `POST` | `/api/admin/upload` | Upload an audio file |
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
│   │   │   └── migrate.ts      # Schema migrations
│   │   └── routes/
│   │       ├── settings.ts
│   │       ├── seasons.ts
│   │       ├── episodes.ts
│   │       └── admin/          # Auth, CRUD, upload, settings
│   ├── tests/
│   ├── data/                   # SQLite DB + uploaded audio (gitignored)
│   ├── Dockerfile              # Production multi-stage build
│   └── Dockerfile.dev
├── client/
│   ├── src/
│   │   ├── App.tsx             # Root component + view routing
│   │   ├── api.ts              # Typed fetch client
│   │   ├── types.ts            # Shared TypeScript types
│   │   ├── store/
│   │   │   └── playerStore.ts  # Zustand audio player state
│   │   ├── hooks/
│   │   │   └── useTheme.ts     # CSS accent colour hook
│   │   ├── components/         # Listener UI components
│   │   └── pages/              # AdminLogin, admin/ layout + pages
│   ├── Dockerfile              # Production: Vite build → nginx
│   └── nginx.conf              # SPA fallback + API proxy
├── scripts/
│   └── hash-password.sh        # bcrypt password hash helper
├── docker-compose.yml          # Dev
└── docker-compose.prod.yml     # Production
```

---

## Testing

```bash
# Server (49 tests)
cd server && npm test

# Client (83 tests)
cd client && npm test
```

Lint:

```bash
cd server && npm run lint
cd client && npm run lint
```
