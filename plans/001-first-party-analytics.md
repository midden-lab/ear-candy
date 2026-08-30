---
id: first-party-analytics
title: "First-party content analytics (traffic, episode listens, audience-shape breakdowns)"
status: complete
priority: 1
created: 2026-08-29
steps_completed: 10
steps_total: 10
tags: [analytics, privacy, admin-panel, schema-migration, public-api]
---

# First-party content analytics

## Summary

Adds self-hosted, first-party analytics to Ear Candy: overall traffic (page views, sessions), per-episode listen tracking (plays, completion/drop-off), and lightweight audience-shape breakdowns (country, device/browser/OS, referrer). All data is stored in the existing SQLite DB and never leaves the host — no third-party analytics service, no external accounts required for the feature to work. Because Ear Candy is being open-sourced, the feature must work "vanilla" (fresh clone, no external setup) and respect the privacy of whoever the operator's listeners are, not just the operator.

## Context

**Relevant existing code:**
- `server/src/db/migrate.ts` — versioned migration pattern (`MIGRATIONS` array of guarded `ALTER TABLE ADD COLUMN`, `schema_migrations` tracking, automatic pre-migration `.bak`) plus a `CREATE TABLE IF NOT EXISTS` block for base schema (always safe/idempotent, not version-tracked). New tables go in the base-schema block per this repo's own convention; new columns on existing tables go through `MIGRATIONS`.
- `server/src/utils/crawler.ts` — `isKnownCrawler(userAgent)`, already used for OG-tag bot detection. Reuse directly rather than writing new bot-UA matching.
- `server/src/auth.ts` / `routes/admin/*` — `requireAdmin` preHandler pattern for authenticated routes; `app.db.prepare().run()/.get()/.all()` for DB access.
- `server/src/app.ts` — plugin/route registration list (~lines 219-229); `@fastify/rate-limit` already registered globally at `max: 1000, timeWindow: '1 minute'` (a deliberately generous backstop for read traffic, not sized for a write endpoint — see Step 4).
- `client/src/store/playerStore.ts` — Zustand store for player state only; side effects (like analytics calls) belong in the component that owns the `<audio>` ref (`AudioPlayer.tsx`), not the store itself, matching this codebase's existing separation.
- `client/src/components/AudioPlayer.tsx` — owns `handleTimeUpdate`, `handleEnded`, and the `onPlaybackResumed`/`onWaiting`/`onPlaybackError` callbacks wired to `AudioPlayerView`. This is where play/progress/completion instrumentation hooks in.
- `client/src/App.tsx` — boot-time effect (~lines 56-100) fetches settings/seasons/episodes and resolves deep links; a second effect (~lines 102-122) reacts to `settings` becoming available (sets document title/favicon) — the natural hook point for a one-time page-view event.
- `client/src/utils/shareUrl.ts` — `buildShareUrl` builds the `?episode=X&t=Y` deep link.
- `client/src/api.ts` — `request<T>()` (plain fetch, public) and `adminRequest<T>()` (`credentials: 'include'`, admin) wrapper pattern.
- `server/src/types.ts` / `client/src/types.ts` — shared interfaces, kept in sync manually.
- No RSS feed exists anywhere in this app — all listening happens through this app's own web player, so this is web-app analytics, not podcast-download analytics. No IAB/podcast-host analytics concepts (downloads, enclosures) apply.

**Decisions made in design discussion (treat as fixed, not open):**
- Fully first-party, in the existing SQLite DB. No third-party analytics service (ruled out explicitly — Ear Candy's stated position once open-sourced is no third-party integrations or externally-tracked user data).
- Built-in analytics ON by default (`settings.analytics_enabled`, default `true`) — data never leaves the host, so the privacy cost of "on" is low, and a fresh deploy should demonstrate the feature working. An admin can disable it.
- New-vs-returning listener tracking is a **separate** toggle (`settings.track_returning_listeners`, default `true`) since it implies a persistent (not per-visit) client-side identifier. When on, the session id lives in `localStorage` (persists across visits). When off, it falls back to `sessionStorage` (cleared on tab close, per-visit only) — events still record correctly either way, they just can't roll up into new-vs-returning stats when off.
- Geography resolved via a **local** GeoIP country database (DB-IP "IP to Country Lite" — CC BY 4.0, no account/signup required, unlike MaxMind GeoLite2 which now requires a licensed account). No outbound network call per request; the raw IP is resolved then discarded, only the ISO country code is persisted. Geo must degrade gracefully (silently return `null`/omit from the dashboard) when no database file is present — it is not a hard dependency of the rest of the feature.
- Device/OS/browser parsed **server-side** from the `User-Agent` header (already present on every request) into coarse buckets — no new client dependency, no fingerprinting-grade parsing.
- Raw events accumulate indefinitely — no pruning in this plan (see Step 10 for the documented follow-up).
- `POST /api/analytics/event` is the first public, unauthenticated **write** route in this codebase (every other public route is read-only). It needs its own tighter rate limit, strict payload validation, a small body-size cap, and must never let its response differ based on whether an `episode_id` was valid/hidden/nonexistent (no enumeration oracle). See Step 4.

## Steps

### Step 1: Database schema — events table + settings analytics toggles

**Files:** `server/src/db/migrate.ts`, `server/src/types.ts`, `client/src/types.ts`
**Requires review:** true

In `server/src/db/migrate.ts`:

1. Add a new `CREATE TABLE IF NOT EXISTS events (...)` block alongside the existing `settings`/`seasons`/`episodes`/`schema_migrations` blocks (new tables are not version-tracked, per this file's existing convention):

```sql
CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type   TEXT NOT NULL CHECK(event_type IN ('page_view','play_start','listen_progress','play_complete')),
  episode_id   INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
  season_id    INTEGER REFERENCES seasons(id) ON DELETE SET NULL,
  session_id   TEXT NOT NULL,
  position_pct INTEGER CHECK(position_pct IS NULL OR position_pct IN (25,50,75,90)),
  referrer     TEXT,
  country      TEXT,
  device_type  TEXT,
  os           TEXT,
  browser      TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
)
```

   Also add these indexes (used by the admin aggregate queries in Step 5 and the duplicate-debounce check in Step 4):
```sql
CREATE INDEX IF NOT EXISTS idx_events_episode_id ON events(episode_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_session_dedup ON events(session_id, event_type, episode_id, created_at);
```
   `ON DELETE SET NULL` requires `PRAGMA foreign_keys = ON`, already enabled in `db/index.ts` — deleting an episode/season should orphan its historical events (still countable in aggregate traffic), not cascade-delete them.

2. Add two new entries to the `MIGRATIONS` array (next versions after the existing 3 — i.e. version 4 and 5), following the exact `columnExists`/`alreadyApplied`/`up` shape of the existing entries:
   - version 4: `settings.analytics_enabled INTEGER NOT NULL DEFAULT 1`
   - version 5: `settings.track_returning_listeners INTEGER NOT NULL DEFAULT 1`

In `server/src/types.ts`, add to `Settings`:
```ts
analytics_enabled: boolean
track_returning_listeners: boolean
```
(Booleans are stored as `INTEGER` 0/1 in SQLite and mapped to JS `boolean`, same convention as `Season.hidden`/`Episode.hidden` — the route layer in Step 1 doesn't need to convert here since `better-sqlite3` returns raw integers; conversion happens where the row is read/written, same as existing `hidden` handling in the admin routes.)

Also add a new shared type (used by Steps 4-6):
```ts
export type AnalyticsEventType = 'page_view' | 'play_start' | 'listen_progress' | 'play_complete'
```

Mirror both changes in `client/src/types.ts`.

**Acceptance criteria:**
- [ ] `runMigrations()` against a fresh `:memory:` DB creates the `events` table and its three indexes with no errors.
- [ ] `runMigrations()` against a DB already at version 3 applies versions 4 and 5, backfilling `analytics_enabled=1` and `track_returning_listeners=1` on the existing settings row.
- [ ] Running migrations twice in a row is a no-op the second time (idempotent, matching every existing migration).
- [ ] `server/tests/migrate.test.ts` gains coverage for the new table and the two new columns (extend existing tests, don't replace them).

---

### Step 2: GeoIP infrastructure — local country lookup, no external calls at runtime

**Files:** `server/src/utils/geoip.ts` (new), `scripts/fetch-geoip-db.sh` (new), `server/package.json`, `.gitignore`, `README.md`
**Requires review:** true

1. Add the `maxmind` npm package as a `server` dependency (reads `.mmdb` files — the format both MaxMind and DB-IP publish, so it works with DB-IP's free database despite the package name). Verify the exact current API (`Reader`/`open()` exports, `.get(ip)` return shape) against the installed version's TypeScript types at implementation time — package APIs can shift between versions.

2. Create `server/src/utils/geoip.ts`:
```ts
export async function resolveCountry(ip: string): Promise<string | null>
```
   - Lazily loads the `.mmdb` file from the path in `process.env.GEOIP_DB_PATH` on first call, caching the reader in a module-level variable for the process lifetime (no per-request file I/O).
   - If `GEOIP_DB_PATH` is unset, or the file doesn't exist, or it fails to parse: cache a "no reader available" sentinel and return `null` for every call — this must never throw, and must never block/slow the request path waiting on a file that isn't there. Log once (not per-request) via the app's existing pino logger that geo resolution is disabled, at startup or on first use — not on every request.
   - On a successful lookup, return the ISO country code (e.g. `"US"`) or `null` if the IP isn't found in the database (common for private/local IPs in dev).
   - Export a test-only reset hook (e.g. `__resetGeoipCacheForTests()`) so `server/tests/` can exercise both the "no DB present" and "DB present" paths without process restarts.

3. Create `scripts/fetch-geoip-db.sh` (repo root, alongside `hash-password.sh`/`downsample-audio-dir.sh` — general-purpose local tooling, not a one-off production maintenance script). Portable to macOS's stock bash 3.2 per this repo's existing convention (`scripts/downsample-audio-dir.sh`'s header explains why — no bash 4+ features). Behavior:
   - Takes an optional destination path argument, defaulting to `server/data/geoip/dbip-country-lite.mmdb`.
   - Computes the current year-month, constructs the DB-IP free download URL, and downloads + decompresses it to the destination (creating parent directories as needed). **Verify the exact current URL pattern against https://db-ip.com/db/lite.php at implementation time** — this plan's assumption (`https://download.db-ip.com/free/dbip-country-lite-<YYYY>-<MM>.mmdb.gz`) is based on DB-IP's documented naming convention as of this plan's writing, but external download URLs can change without notice.
   - Falls back to the previous month's file if the current month's isn't published yet (DB-IP publishes early each month; the first few days of a new month may 404 on the just-started month's file).
   - Prints where it wrote the file and reminds the operator this needs periodic re-running (monthly) to stay current, and that usage requires attribution to DB-IP per their CC BY 4.0 license.
   - Same script works for both local dev (default destination) and production (pass `/opt/ear-candy/data/geoip/dbip-country-lite.mmdb` as the destination when run on the Droplet, per the one-off-script pattern already documented in CLAUDE.md).

4. Add `server/data/geoip/` to `.gitignore` (the `.mmdb` file must never be committed — it's large and needs periodic refresh, same reasoning as the existing `server/data/uploads/*` / `*.sqlite` entries).

5. Add a `GEOIP_DB_PATH` row to the "Optional environment variables" table in `README.md`, explaining what it's for, that geography silently doesn't appear in the dashboard without it, and pointing at `scripts/fetch-geoip-db.sh`.

**Acceptance criteria:**
- [ ] `resolveCountry()` returns `null` (not a thrown error) when `GEOIP_DB_PATH` is unset, when it points at a nonexistent file, and when it points at a corrupt/non-mmdb file.
- [ ] `resolveCountry()` returns a correct ISO country code for a known test IP once a real `.mmdb` file is loaded (test fixture: either a small real DB-IP file checked into `server/tests/fixtures/` if size-reasonable, or a mocked reader).
- [ ] `scripts/fetch-geoip-db.sh` runs successfully on macOS bash 3.2 syntax (no `declare -A`, no `[[ ]]`-only bashisms beyond what the existing scripts already use) and on a fresh directory with no pre-existing `server/data/geoip/`.
- [ ] `server/data/geoip/` is gitignored; `git status` after running the fetch script shows no new tracked files.

---

### Step 3: User-Agent parsing utility

**Files:** `server/src/utils/userAgent.ts` (new), `server/tests/user-agent.test.ts` (new)
**Requires review:** false

Create `server/src/utils/userAgent.ts`:
```ts
export interface ParsedUserAgent {
  deviceType: 'mobile' | 'tablet' | 'desktop'
  os: string | null
  browser: string | null
}

export function parseUserAgent(userAgent: string | undefined): ParsedUserAgent
```
Coarse, regex-based bucketing only — same spirit as `isKnownCrawler()`, not a fingerprinting-grade parse and no new dependency:
- `deviceType`: `'mobile'` for phone UAs (`Mobile`, `iPhone`, `Android` without `Tablet`), `'tablet'` for `iPad`/`Android` `Tablet` patterns, `'desktop'` otherwise (including when `userAgent` is undefined/empty — a missing UA defaults to desktop rather than a fourth "unknown" bucket, keeping the type small).
- `os`: coarse buckets — `'iOS'`, `'Android'`, `'macOS'`, `'Windows'`, `'Linux'`, or `null` if unrecognized.
- `browser`: coarse buckets — `'Chrome'`, `'Safari'`, `'Firefox'`, `'Edge'`, or `null` if unrecognized. Order matters (e.g. Chrome's UA string also contains "Safari" — check Chrome/Edge before Safari).

**Acceptance criteria:**
- [ ] Correctly buckets real UA strings for: iPhone Safari, Android Chrome, iPad Safari, desktop macOS Safari, desktop macOS Chrome, desktop Windows Chrome, desktop Windows Firefox, desktop Linux Firefox.
- [ ] Returns `{ deviceType: 'desktop', os: null, browser: null }` for `undefined` input — never throws.
- [ ] Test file covers at least the 8 cases above plus the undefined case.

---

### Step 4: Public ingestion endpoint — `POST /api/analytics/event`

**Files:** `server/src/routes/analytics.ts` (new), `server/src/app.ts`, `server/tests/analytics.test.ts` (new)
**Requires review:** true — first public, unauthenticated **write** route in this codebase; abuse-resistance is a first-class design concern here, not an afterthought.

Create `server/src/routes/analytics.ts`:
```ts
export const analyticsRoute: FastifyPluginAsync
```
Registers `POST /analytics/event` with:
- `bodyLimit: 4096` (route-level override — this payload is a handful of short fields; far smaller than the global default used for uploads).
- `config: { rateLimit: { max: 120, timeWindow: '1 minute' } }` — a dedicated, tighter-than-global limit (the existing global 1000/min is sized for cheap reads, not a write endpoint; 120/min per IP stays generously above realistic legitimate traffic — an active browsing session generates at most a few dozen events — while bounding worst-case DB write amplification from a scripted flood). Key on IP (the `@fastify/rate-limit` default), not `session_id`, since the body isn't available at the rate-limit evaluation point.

Request body shape (validated by hand in the handler, matching this codebase's existing convention of inline validation rather than a schema-validation library — see e.g. `routes/admin/seasons.ts`):
```ts
interface AnalyticsEventBody {
  event_type: AnalyticsEventType
  episode_id?: number
  season_id?: number
  session_id: string
  position_pct?: 25 | 50 | 75 | 90
  referrer?: string
}
```

Handler logic, in order (early-exit as soon as a request should be silently dropped — always respond `204` regardless of which branch is taken, so the response never differs based on validity/existence of `episode_id`, preventing use of this endpoint to enumerate hidden/nonexistent episode ids):

1. Validate shape: `event_type` must be one of the 4 allowed values; `session_id` must be a non-empty string under ~128 chars; `position_pct` if present must be exactly `25|50|75|90`; `episode_id`/`season_id` if present must be integers; `referrer` if present capped to ~500 chars. On any shape violation, respond `400` with a generic error (this is fine to differ from `204` — it reveals nothing about episode/season validity, only about payload shape).
2. Read `SELECT analytics_enabled FROM settings` (single-row lookup, cheap). If `analytics_enabled` is falsy, respond `204` immediately — no further work, nothing written.
3. If `isKnownCrawler(req.headers['user-agent'])`, respond `204` immediately — don't record bot traffic.
4. If `episode_id` is present, check `SELECT id FROM episodes WHERE id = ?` — if it doesn't match a row, null it out before insert (never reject; a slightly-stale client after an episode deletion shouldn't error). Same for `season_id` against `seasons`.
5. Duplicate-debounce: `SELECT 1 FROM events WHERE session_id = ? AND event_type = ? AND episode_id IS ? AND created_at > datetime('now', '-5 seconds') LIMIT 1` — if found, respond `204` without inserting (guards against accidental double-fires, e.g. React effect double-invocation, duplicate beacon sends — not a security control, just data hygiene).
6. Resolve `country` via `resolveCountry(req.ip)` (Step 2) — note `req.ip` already reflects the real client IP correctly given this app's existing `trustProxy`/`TRUSTED_PROXY_IPS` handling (see CLAUDE.md gotcha on trusted proxies), no special-casing needed here.
7. Parse `device_type`/`os`/`browser` via `parseUserAgent(req.headers['user-agent'])` (Step 3).
8. Insert the row, respond `204`.

Register in `server/src/app.ts`: import `analyticsRoute` and add `app.register(analyticsRoute, { prefix: '/api' })` alongside the other route registrations (~line 219-229) — place it with the other public routes (before the admin ones), matching the file's existing grouping.

**Acceptance criteria:**
- [ ] Valid `play_start`/`listen_progress`/`play_complete`/`page_view` payloads each insert exactly one row with the expected column values.
- [ ] Malformed `event_type`, out-of-range `position_pct`, non-integer `episode_id`, and oversized `referrer` all return `400` and write nothing.
- [ ] An `episode_id` that doesn't exist in `episodes` still returns `204` and inserts a row with `episode_id = NULL` — response is identical in shape/status to a valid one.
- [ ] `analytics_enabled = 0` on the settings row: valid payloads return `204` and write nothing.
- [ ] A request with a known-crawler `User-Agent` returns `204` and writes nothing.
- [ ] Sending the same `(session_id, event_type, episode_id)` twice within 5 seconds inserts only one row.
- [ ] A 121st request from the same IP within a minute receives `429` (rate limit engaged) — test can call the route handler directly enough times, or assert the route config's `rateLimit.max` value if a full 121-request test is impractical in the suite.
- [ ] Request body larger than the `bodyLimit` is rejected before reaching the handler.

---

### Step 5: Admin analytics query endpoints

**Files:** `server/src/routes/admin/analytics.ts` (new), `server/src/app.ts`, `server/tests/admin-analytics.test.ts` (new)
**Requires review:** false

Create `server/src/routes/admin/analytics.ts`, all routes `{ preHandler: requireAdmin }`:

**`GET /admin/analytics/overview?days=30`** → `AnalyticsOverview`:
```ts
export interface AnalyticsOverview {
  totalPageViews: number
  totalPlayStarts: number
  totalPlayCompletes: number
  uniqueSessions: number
  newSessions: number
  returningSessions: number
  timeseries: { date: string; page_views: number; play_starts: number }[]
}
```
`days` (default 30) bounds the window via `created_at >= datetime('now', '-N days')`. `newSessions`/`returningSessions` split `uniqueSessions` in the window by whether each `session_id`'s *earliest ever* event (not just earliest in-window) falls inside or before the window start — e.g. a session is "returning" if `(SELECT MIN(created_at) FROM events e2 WHERE e2.session_id = e.session_id) < <window_start>`. `timeseries` groups by `date(created_at)`.

**`GET /admin/analytics/episodes`** → `AnalyticsEpisodeStat[]`:
```ts
export interface AnalyticsEpisodeStat {
  episode_id: number
  title: string
  play_starts: number
  play_completes: number
  completion_rate: number   // play_completes / play_starts, 0 when play_starts is 0
  milestone_25: number
  milestone_50: number
  milestone_75: number
  milestone_90: number
}
```
Joins `events` against `episodes` (for `title`), grouped by `episode_id`, counting each `event_type`/`position_pct` combination. Sorted by `play_starts` descending. Episodes with zero events are omitted (not zero-filled) — keeps the response small and the admin table meaningful.

**`GET /admin/analytics/breakdowns?days=30`** → `AnalyticsBreakdowns`:
```ts
export interface AnalyticsBreakdowns {
  countries: { key: string; count: number }[]
  devices: { key: string; count: number }[]
  browsers: { key: string; count: number }[]
  os: { key: string; count: number }[]
  referrers: { key: string; count: number }[]
}
```
Computed from `page_view` events only within the window (avoids double-counting the same visit across its play/progress events), grouped/counted per column, `NULL` values excluded, each list sorted by `count` descending.

Register in `server/src/app.ts`: import `adminAnalyticsRoute`, add `app.register(adminAnalyticsRoute, { prefix: '/api' })` alongside the other admin route registrations.

Add the three interfaces above to both `server/src/types.ts` and `client/src/types.ts`.

**Acceptance criteria:**
- [ ] All three endpoints return `401` without a valid admin session cookie.
- [ ] `overview`: seeding events across and outside a `days` window correctly includes/excludes them; a session with an event before the window and one inside it counts as "returning," a session with only in-window events counts as "new."
- [ ] `episodes`: completion_rate math is correct including the zero-`play_starts` case (no division-by-zero); episodes with no events don't appear in the result.
- [ ] `breakdowns`: only `page_view` events are counted; `NULL` country/device/browser/os/referrer values are excluded from their respective lists, not shown as an "unknown" bucket.

---

### Step 6: Client analytics utility

**Files:** `client/src/utils/analytics.ts` (new), `client/src/api.ts`, `client/src/tests/analytics.test.ts` (new)
**Requires review:** false

Create `client/src/utils/analytics.ts`:
```ts
export function trackPageView(): void
export function trackPlayStart(episodeId: number, seasonId: number): void
export function trackListenProgress(episodeId: number, seasonId: number, positionPct: 25 | 50 | 75 | 90): void
export function trackPlayComplete(episodeId: number, seasonId: number): void
```
Internals:
- A module-level, memoized `Promise` wrapping one `getSettings()` call (from `api.ts`) that resolves `{ analyticsEnabled: boolean; trackReturning: boolean }` from `settings.analytics_enabled`/`settings.track_returning_listeners`. Every `track*` call awaits this before doing anything — if `analyticsEnabled` is false, or the settings fetch itself failed, no request is sent at all (fail closed, not open). Memoizing means this is one extra `/api/settings` call per page load beyond `App.tsx`'s own — acceptable at this scale; avoids threading settings as props through `AudioPlayer`/`AudioPlayerView`. Note this tradeoff in a code comment.
- `getSessionId(persistent: boolean): string` — reads/writes a `crypto.randomUUID()`-generated id under a fixed key (e.g. `'ec_session_id'`) in `localStorage` when `persistent` is true, `sessionStorage` otherwise. `persistent` is the resolved `trackReturning` setting.
- `sendAnalyticsEvent(payload)` — builds the full body (adds `session_id`, and `referrer` for `page_view` only — see below), then delivers via `navigator.sendBeacon` if available, falling back to `fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body, keepalive: true }).catch(() => {})` — mirrors the reliability pattern already used for eager position-saving in `AudioPlayer.tsx` (fire-and-forget, must never throw into the caller).
- `trackPageView()` builds `referrer` as: if `?ref=share` is present in `window.location.search`, use the literal string `'share-link'`; otherwise `document.referrer || undefined`.

Add to `client/src/api.ts` (following the existing `adminRequest<T>` pattern):
```ts
export const getAnalyticsOverview = (days = 30) => adminRequest<AnalyticsOverview>(`/api/admin/analytics/overview?days=${days}`, 'GET')
export const getAnalyticsEpisodeStats = () => adminRequest<AnalyticsEpisodeStat[]>('/api/admin/analytics/episodes', 'GET')
export const getAnalyticsBreakdowns = (days = 30) => adminRequest<AnalyticsBreakdowns>(`/api/admin/analytics/breakdowns?days=${days}`, 'GET')
```

**Acceptance criteria:**
- [ ] With `analytics_enabled: false` (mocked `getSettings`), no `track*` call results in a `sendBeacon`/`fetch` call.
- [ ] With `track_returning_listeners: true`, the session id is written to `localStorage`; with `false`, to `sessionStorage`; the same id is reused across multiple calls within the same storage's lifetime.
- [ ] `trackPageView()` sends `referrer: 'share-link'` when `location.search` contains `ref=share`, and `document.referrer` otherwise.
- [ ] When `navigator.sendBeacon` is unavailable (mocked absent), the `fetch` fallback is used instead, with `keepalive: true`.
- [ ] A rejected `getSettings()` call results in no events being sent (fails closed) and doesn't throw out of any `track*` call.

---

### Step 7: Wire client instrumentation into the player and app boot

**Files:** `client/src/components/AudioPlayer.tsx`, `client/src/App.tsx`, `client/src/utils/shareUrl.ts`, existing tests for all three
**Requires review:** false

**`shareUrl.ts`:** in `buildShareUrl`, add `url.searchParams.set('ref', 'share')` alongside the existing `episode`/`t` params — one line, gives `trackPageView()` (Step 6) something to key off for "opened via share link."

**`App.tsx`:** in the existing effect at ~lines 102-122 (`if (!settings) return; document.title = ...`), add a call to `trackPageView()` guarded by a `useRef` flag (e.g. `pageViewSentRef`) so it fires exactly once per app load even under React 19 StrictMode's dev-mode double-invocation — not on every subsequent `settings` change (e.g. after an admin edits settings and the effect re-runs for title/favicon reasons).

**`AudioPlayer.tsx`:**
1. Add a ref tracking per-episode analytics dedup state, reset in the existing effect at lines 66-76 (the one that already resets `endedRef.current = false` on `episode?.id` change) — add alongside it:
```ts
const analyticsStateRef = useRef<{ playStartSent: boolean; milestonesSent: Set<number> }>({ playStartSent: false, milestonesSent: new Set() })
```
reset to `{ playStartSent: false, milestonesSent: new Set() }` in that same effect body.

2. In `onPlaybackResumed` (currently `() => { setLoading(false); setError(false) }`, passed to `AudioPlayerView` ~line 139): if `episode` exists and `!analyticsStateRef.current.playStartSent`, call `trackPlayStart(episode.id, episode.season_id)` and set the flag true. This fires once per episode-load-then-actually-playing, not on every pause/resume within the same episode.

3. In `handleTimeUpdate` (line 104-110), after `setCurrentTime(t)`: if `episode` and `duration > 0`, compute `pct = (t / duration) * 100`, and for each of `[25, 50, 75, 90]` not already in `analyticsStateRef.current.milestonesSent` where `pct >= milestone`, call `trackListenProgress(episode.id, episode.season_id, milestone)` and add it to the set.

4. In `handleEnded` (line 112-118), after the existing logic: if `episode`, call `trackPlayComplete(episode.id, episode.season_id)`.

Import `trackPlayStart`, `trackListenProgress`, `trackPlayComplete` from `../utils/analytics` in `AudioPlayer.tsx`, and `trackPageView` from `./utils/analytics` in `App.tsx`.

**Acceptance criteria:**
- [ ] Loading and playing an episode fires exactly one `play_start` call, even if the listener pauses and resumes multiple times.
- [ ] Playing through 30%, 60%, and 95% of an episode's duration fires `listen_progress(25)` then `listen_progress(50)`, `listen_progress(75)` — not `90` yet, and each milestone fires exactly once even with many `timeUpdate` ticks crossing it.
- [ ] A natural `ended` event fires `play_complete` exactly once.
- [ ] Switching to a different episode resets the dedup state — the new episode can independently fire its own `play_start`/milestones.
- [ ] `trackPageView()` fires exactly once per app mount, including under `React.StrictMode` double-invocation in tests.
- [ ] `buildShareUrl` output includes `ref=share` alongside `episode`/`t`.

---

### Step 8: Admin settings UI — analytics toggles

**Files:** `client/src/pages/admin/AdminSettings.tsx`, existing test file for it
**Requires review:** false

Add two checkbox fields following this file's existing `useState` per-field pattern (mirroring how other settings fields are read from `getSettings()` on mount and included in the `updateSettings()` PATCH payload on save):
- "Enable analytics" — `analyticsEnabled` state, bound to `settings.analytics_enabled`.
- "Track returning listeners" — `trackReturningListeners` state, bound to `settings.track_returning_listeners`. Include a short inline help text noting this uses a persistent per-browser identifier stored in the listener's own browser (not tied to any account), only used to distinguish new vs. returning visits in the dashboard.

Both included in the `updateSettings({ ... })` call alongside the existing fields.

Also update `ALLOWED_SETTINGS_PATCH_FIELDS` in `server/src/routes/admin/settings.ts` to include `'analytics_enabled'` and `'track_returning_listeners'`, and update the `PUT /admin/settings` handler's destructuring/insert to include both (default `true` when omitted from a full-replace body, converting boolean → `1`/`0` the same way `hidden` is handled elsewhere in this codebase).

**Acceptance criteria:**
- [ ] Both checkboxes render with their current server-side value on load.
- [ ] Toggling either and saving sends a PATCH including the changed field(s) and persists correctly.
- [ ] `PUT /admin/settings` with a body omitting these two fields still succeeds and defaults both to `true`.
- [ ] `PATCH /admin/settings` rejects any field not in `ALLOWED_SETTINGS_PATCH_FIELDS` exactly as it does today (regression check — the allowlist is a SQL-injection-shaped guard, not just a validation nicety).

---

### Step 9: Admin analytics dashboard tab

**Files:** `client/src/pages/admin/AdminAnalytics.tsx` (new), `client/src/App.tsx`, new test file
**Requires review:** false

Create `client/src/pages/admin/AdminAnalytics.tsx`, following the file/export conventions of `EpisodeManager.tsx`/`AdminSettings.tsx` (default-exported function component, fetches its own data on mount via the `api.ts` functions from Step 6). No new client dependency (no charting library) — plain HTML tables/lists, consistent with this app's minimal-dependency client `package.json`.

Layout:
- A summary row: total page views, total play starts, total play completes, unique sessions, new vs. returning split (from `getAnalyticsOverview()`).
- A simple day-by-day table or lightweight CSS-bar visualization of the `timeseries` data (no chart library — e.g. relative-width `<div>` bars driven by inline `style`, consistent with how this codebase already avoids adding dependencies for small UI needs).
- An episode table (from `getAnalyticsEpisodeStats()`): title, play starts, completion rate, milestone columns — sorted by play starts (already sorted server-side).
- Three breakdown lists (from `getAnalyticsBreakdowns()`): top countries, top device/OS/browser combinations, top referrers — each showing key + count, capped to a reasonable top-N (e.g. top 10) client-side if the API doesn't already cap it.

In `App.tsx`: extend `AdminTab` from `'episodes' | 'settings'` to `'episodes' | 'settings' | 'analytics'`, add a third tab button (~lines 188-199, matching the existing two buttons' styling/active-state pattern exactly), and render `<AdminAnalytics />` when `adminTab === 'analytics'`.

**Acceptance criteria:**
- [ ] The new tab button appears alongside Episodes/Settings, with matching active/inactive styling.
- [ ] Clicking it renders `AdminAnalytics`, which fetches and displays all three endpoints' data.
- [ ] An episode with zero events doesn't appear in the episode table (matches the API's own omission behavior from Step 5, not re-filtered awkwardly client-side).
- [ ] Both light and dark Tailwind variants are present on every color class in the new component (per this codebase's styling convention — no "base is dark" shortcut).

---

### Step 10: Documentation and retention follow-up

**Files:** `README.md`, a new GitHub issue
**Requires review:** true — creates a public/team-visible GitHub issue, an action with an audience beyond this repo's code.

In `README.md`:
- Add a short "Analytics" subsection (near "Admin interface") explaining: analytics are first-party and on by default, no data leaves the host, operators can disable it or disable new-vs-returning tracking from the Settings tab, and geography requires the optional `GEOIP_DB_PATH` setup (`scripts/fetch-geoip-db.sh`) described in Step 2's README addition.
- In that same section (or right next to the `data/` persistence note), document that raw analytics events accumulate indefinitely with no built-in pruning in this version, and link to the tracking issue created below.

File a GitHub issue (via `gh issue create`) titled something like "Analytics events table has no retention/pruning policy" — body should note: raw events in the `events` table (added in this plan) grow unbounded, no rollup/aggregation tables exist, and this may be worth addressing later (e.g. a maintenance script following the pattern of `server/scripts/backfill-durations.mjs`/`downsample-audio.sh`) if disk usage becomes a real concern at some deployment's scale. Not urgent for the initial release.

**Acceptance criteria:**
- [ ] README's Analytics subsection accurately reflects the shipped defaults (on by default, local-only, optional geo).
- [ ] The retention caveat and a link to the filed issue both appear in the README.
- [ ] A GitHub issue exists (confirm via `gh issue view <number>` or the returned URL) matching the description above.

## Testing

- **Server (Vitest, `server/tests/`):** New/extended test files per step — `migrate.test.ts` (Step 1), a fixture-or-mock-driven `geoip.test.ts` and `user-agent.test.ts` (Steps 2-3), `analytics.test.ts` for the public endpoint (Step 4, including the abuse-resistance cases: rate limit, dedup, bot filtering, disabled-analytics short-circuit, and the no-oracle response-shape check), `admin-analytics.test.ts` for the three aggregate endpoints (Step 5). All follow the existing `buildTestApp()`/`app.inject()` pattern — no running server needed.
- **Client (Vitest + jsdom, `client/src/tests/`):** `analytics.test.ts` for the utility (Step 6, mocking `fetch`/`sendBeacon`/`getSettings`), extended `AudioPlayer.test.ts`/`App.test.tsx` for instrumentation wiring (Step 7) — be aware of the global `HTMLMediaElement.prototype.src` error-simulation patch in `client/src/tests/setup.ts`; any test rendering a real `<audio>` element and awaiting something afterward needs the same no-op override other player tests already apply. Extended `AdminSettings.test.tsx` (Step 8) and a new `AdminAnalytics.test.tsx` (Step 9).
- **E2E:** Not planned for this feature. Per this codebase's existing gotchas, real audio decoding is unreliable in CI regardless of what triggers it, and the event-taxonomy/dedup/threshold logic this feature depends on is exactly the kind of thing unit tests cover more reliably than a real browser + Playwright would. If a single smoke-level e2e check is wanted later (e.g. "an admin can see the Analytics tab"), that's a small addition to `e2e/tests/admin.spec.ts`, not part of this plan.

## Notes

- **Alternatives considered:** A third-party/self-hosted analytics service (GoatCounter, Umami, Plausible CE, PostHog OSS) was evaluated and rejected once the open-source distribution goal was clarified — none of them natively model "% of episode X listened to," so the episode-tracking half would need custom event modeling regardless of which was chosen, and depending on an external service (even self-hosted, even the operator's own account) conflicts with the stated goal of zero third-party integrations and zero externally-tracked user data for the open-sourced project.
- **MaxMind vs. DB-IP:** MaxMind's GeoLite2 was the initial assumption for GeoIP but requires a free account + license key — a real setup step for every self-hoster. DB-IP's "IP to Country Lite" needs no account, same `.mmdb` format, so it was chosen instead. Its download URL should be reverified at implementation time (see Step 2).
- **Per-episode geo/device/referrer breakdowns** (as opposed to site-wide) were considered but scoped out — the `events` schema supports adding this later (the columns already exist per-row), it would just need additional grouped queries in Step 5's `episodes` endpoint. Not included now to keep the initial dashboard's query surface small.
- **A generic third-party-script injection point** (an admin-settings field that, if set by an operator, injects an arbitrary analytics `<script>` tag for those who want to bring their own GoatCounter/Plausible/GA account) was discussed as a possible fast-follow for operators who want more than the built-in dashboard offers, but is explicitly out of scope for this plan given the "no third-party integrations" direction — revisit only if actually requested later.
