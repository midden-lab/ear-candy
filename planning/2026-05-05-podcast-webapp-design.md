# Ear Candy — Podcast Webapp Design Spec

**Date:** 2026-05-05
**Status:** Approved

---

## 1. Purpose

A self-hostable podcast webapp for individual businesses and client deployments. Each deployment hosts a single podcast. Listeners browse seasons and episodes, read episode descriptions, and play audio in the browser. Admins manage all content through a separate web interface at `/admin`.

---

## 2. Architecture

Two processes in development, one image in production.

```
ear-candy/
├── server/       # Fastify API + SQLite + audio file serving
│   └── data/     # SQLite database file + uploaded audio files
└── client/       # React + Vite SPA
```

**Development:** Docker Compose runs two services — `server` (Fastify, port 3001, volume-mounted `data/`) and `client` (Vite dev server, port 5173, proxies `/api` to server). Both hot-reload.

**Production:** Single multi-stage Docker image. Stage 1 builds the React app with Vite. Stage 2 copies the build into the Fastify server, which serves the static files and the API on a single port (default 3000).

**Auth:** Single admin password stored as a bcrypt hash in the environment variable `ADMIN_PASSWORD_HASH`. On successful login, the server issues a signed session cookie. No listener accounts.

---

## 3. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript (server + client) | Type safety across the data model; compiler catches schema/API mismatches |
| API framework | Fastify | Built-in JSON Schema validation, active maintenance, faster than Express |
| Frontend | React 19 + Vite | Component model suits the 3-pane stateful UI |
| State management | Zustand | Lightweight shared state for the player across panes |
| CSS | Tailwind CSS + CSS custom properties | Tailwind for layout; CSS vars for theming (accent color, dark/light) |
| Database | SQLite via `better-sqlite3` | Zero-config, single-file, trivially backed up; workload is read-heavy |
| Containerisation | Docker + Docker Compose | Docker Compose for dev; single multi-stage image for production |

---

## 4. Data Model

### `settings` (singleton — one row)

| Column | Type | Notes |
|---|---|---|
| `podcast_name` | text | Displayed in the listener UI header |
| `tagline` | text | Short subtitle |
| `description` | text | Shown on the podcast landing/about state |
| `cover_art_path` | text | Local file path; null if not set |
| `accent_color` | text | Hex string, e.g. `#5a3ef5`; defaults to `#5a3ef5` |

### `seasons`

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | |
| `number` | integer | Display order |
| `title` | text | e.g. "Season 1" or a custom name |
| `description` | text | |
| `cover_art_path` | text | |
| `hidden` | boolean | Hiding a season hides all its episodes in the listener view |
| `created_at` | datetime | |

### `episodes`

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | |
| `season_id` | integer FK | → `seasons.id` |
| `number` | integer | Episode number within the season |
| `title` | text | |
| `description` | text | Free-form text; shown below the player in the listener detail pane |
| `guests` | text | Comma-separated names, e.g. `"Jane Doe, John Smith"` |
| `tags` | text | Comma-separated content tags, e.g. `"Interview, Technique"`; displayed as purple pills in the detail pane |
| `cover_art_path` | text | Per-episode artwork; falls back to the parent season's `cover_art_path` if null |
| `duration_seconds` | integer | Used to display formatted duration |
| `publish_date` | date | |
| `audio_type` | text | `'upload'` or `'url'` |
| `audio_path` | text | Local file path (upload) or external URL |
| `hidden` | boolean | Hidden episodes are invisible to listeners |
| `created_at` | datetime | |
| `updated_at` | datetime | |

---

## 5. Listener UI

### Layout — App Shell (3 panes)

```
┌──────┬──────────────────┬────────────────────────────────┐
│ Rail │  Episode List    │  Detail / Player               │
│ 52px │  260px           │  flex: 1                       │
└──────┴──────────────────┴────────────────────────────────┘
```

**Icon Rail (leftmost):** Logo mark, navigation icons (Episodes, Seasons, Search), floating dark/light mode badge anchored bottom-right of the shell.

**Episode List Panel:** Podcast name at top, season filter tabs below. Episodes listed with: episode number, title, publish date, duration, guest name preview (italic, truncated). The currently playing episode shows an animated EQ bar indicator. Active episode has a left accent border and tinted background.

**Detail Pane (rightmost):** Episode artwork, title, season/episode label, publish date. Guest names and content tags rendered as pill badges (guests: blue; tags: purple). Player controls below the hero. Description rendered as plain text with an "About this episode" label. No tabs.

### Player Controls

Progress bar (scrubbable) with a thumb indicator. Timestamp display (elapsed / remaining). Controls row: skip to start, −15s, play/pause, +15s, skip to end, playback speed toggle (1× / 1.5× / 2×).

### Theming

- **Default mode:** Follows OS/system preference (`prefers-color-scheme`)
- **Toggle:** Floating badge (☀ / 🌙), bottom-right of the shell; persists preference to `localStorage`
- **Accent color:** Injected as `--accent` CSS custom property on `<html>` at page load from the `settings` table. All interactive elements (active states, progress fill, play button, pill borders) reference `--accent`

---

## 6. Admin UI (`/admin`)

Separate route, distinct layout. Protected by session cookie.

### Sidebar Navigation

- **Episodes** — primary content management view (default); seasons and their episodes managed here
- **Settings** — podcast identity and appearance
- **Sign Out**

### Episode Manager

Seasons rendered as collapsible blocks. Each block has a header (season name, episode count, edit/hide/delete season actions) and an episode table when expanded.

Episode table columns: `#`, Title + guests, Published, Duration, Audio (Upload / URL badge), Status (Live / Hidden badge), Actions.

Actions per episode: Edit (opens form panel), Hide/Show toggle, Delete.

Hidden episodes are visually faded in place; the hide icon becomes a show icon. Delete is a separate red icon — two distinct gestures prevent accidental deletion.

**Edit/Add form panel:** Slides in from the right side of the episode manager (no page navigation). Fields:
- Season (select)
- Episode number
- Title
- Guests (plain text, comma-separated)
- Tags (plain text, comma-separated)
- Description (textarea)
- Publish date
- Duration (mm:ss input; stored as integer seconds)
- Cover art upload (optional; falls back to season art if empty)
- Audio source toggle: Upload File / External URL
- File upload dropzone (shown when Upload selected) or URL input (when URL selected)
- Hidden toggle

### Settings Page

Single page, two sections:

**Identity:** Podcast name, tagline, description.

**Appearance:** Accent color (hex input + live swatch preview), cover art upload.

---

## 7. Deployment

### Development

```bash
docker compose up
```

- `client` service: Vite dev server on port 5173, HMR enabled, `/api` proxied to `server`
- `server` service: Fastify on port 3001, volume-mounted `./server/data` for SQLite + uploads

### Production

```bash
docker build -t ear-candy .
docker run -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e ADMIN_PASSWORD_HASH='$2b$10$...' \
  ear-candy
```

Single image, single port, single volume mount. Operators set `ADMIN_PASSWORD_HASH` to a bcrypt hash of their chosen admin password. A helper script (`scripts/hash-password.sh`) is provided to generate the hash without requiring Node locally.

---

## 8. Out of Scope

- Multiple podcasts per deployment
- Listener accounts or per-user history
- RSS feed generation
- Transcript support
- Email notifications
- Analytics / play count tracking
