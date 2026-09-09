---
id: exclude-admin-ip-from-analytics
title: "Exclude admin-configured IPs from first-party analytics"
status: complete
priority: 1
created: 2026-09-09
steps_completed: 8
steps_total: 8
tags: [analytics, privacy, backend, admin-ui]
---

# Exclude Admin-Configured IPs From First-Party Analytics

## Summary

Adds an admin-configurable, comma-separated list of IP addresses whose traffic is silently excluded from every analytics event type (`page_view`, `play_start`, `listen_progress`, `play_complete`) — so an admin testing the site or a newly uploaded episode doesn't pollute their own listener stats. Includes an "Add my current IP" convenience button in Admin Settings that captures the admin's live `req.ip` from their authenticated session, so they never have to look their own IP up manually.

## Context

**Decided in advance (do not re-litigate):**
- Manual entry **plus** an auto-detect "Add my current IP" button (not manual-only).
- A comma-separated list of exact IPs (not a single IP, not CIDR ranges).
- Exclusion applies to **all four event types**, not just `page_view` — the check happens once, before any event-type-specific logic, so this falls out naturally rather than needing per-type handling.

**Files involved:**
- `server/src/db/migrate.ts` — new additive migration (version 7) for `settings.excluded_analytics_ips`.
- `server/src/types.ts` / `client/src/types.ts` — `Settings` interface.
- `server/src/routes/analytics.ts` — the public, unauthenticated event-ingest endpoint (`POST /api/analytics/event`) where the exclusion is actually enforced.
- `server/src/routes/admin/settings.ts` — `PUT`/`PATCH /api/admin/settings` (add the new field to the allowlist) and a new `GET /api/admin/my-ip`.
- `server/src/routes/settings.ts` — the **public** `GET /api/settings` — already uses an explicit column allowlist rather than `SELECT *` (settings.session_epoch is deliberately excluded there per issue #34). `excluded_analytics_ips` must **never** be added to that list — it's the admin's home/office/mobile IP, and leaking it publicly defeats the purpose of a privacy feature.
- New file `server/src/utils/ipMatch.ts` — IP normalization/matching, mirroring the small-focused-pure-function style of `server/src/utils/geoip.ts` and `server/src/utils/crawler.ts`.
- `client/src/api.ts`, `client/src/pages/admin/AdminSettings.tsx` — the existing "Analytics" section (already has `analytics_enabled`/`track_returning_listeners` checkboxes) gets a new field.

**Why enforcement lives in `analytics.ts`, not the DB layer:** the `events` table stores a resolved `country` but never the raw visitor IP at all (plan 001's explicit privacy design). Exclusion is necessarily prevention-going-forward, not retroactive filtering — there's no IP column to retroactively match against past rows, and this plan does not add one (that would be a privacy regression, storing raw IPs for every visitor just to support an admin-only feature). The check is a pure in-memory comparison against `req.ip` per-request, exactly mirroring the existing `analytics_enabled` and `isKnownCrawler` early-return-204 checks already in that handler (lines 76-83 as of this writing) — this endpoint always returns 204 regardless of what it decided to do, so a caller (or anyone inspecting network traffic) can never distinguish "excluded" from "recorded."

**Why `req.ip` is trustworthy here:** per CLAUDE.md gotcha #8a, production sits behind Caddy with `TRUSTED_PROXY_IPS` correctly configured (fixed for issue #33) — `req.ip` already drives the real login-lockout counter in `server/src/routes/admin/auth.ts`. This plan relies on the same, already-correct mechanism; it does not need to touch `resolveTrustedProxies` or `app.ts`.

**IPv6 normalization:** a dual-stack visitor's IPv4 connection can surface as an IPv4-mapped IPv6 address (`::ffff:203.0.113.5`) depending on the network path, which would not string-match a plain `203.0.113.5` entered by the admin. `ipMatch.ts`'s `normalizeIp` strips that prefix before comparing, on both sides (stored list and incoming `req.ip`).

## Steps

### Step 1: Add the `settings.excluded_analytics_ips` column

**Files:** `server/src/db/migrate.ts`

**Requires review:** true — schema change (additive/nullable, following the established pattern exactly, but any migration gets a review gate per this repo's convention).

Add to the `MIGRATIONS` array, after the existing version-6 entry:
```ts
{
  version: 7,
  description: 'settings.excluded_analytics_ips',
  alreadyApplied: db => columnExists(db, 'settings', 'excluded_analytics_ips'),
  up: db => { db.prepare('ALTER TABLE settings ADD COLUMN excluded_analytics_ips TEXT').run() },
},
```
Nullable, no default (absent/NULL means "no exclusions," matching how `favicon_path`/`browser_tab_title` already model an optional string setting — unlike the boolean settings, this one doesn't need `NOT NULL DEFAULT`).

**Acceptance criteria:**
- [ ] `server/tests/migrate.test.ts` (if it asserts on the full migration list/count — check current content) still passes; add a case confirming `excluded_analytics_ips` exists after migration and that a pre-existing DB without it gets it added.
- [ ] A fresh `:memory:` test DB has the column (`PRAGMA table_info(settings)` includes it).
- [ ] `make test` (server) passes.

---

### Step 2: Add the field to the `Settings` type on both sides

**Files:** `server/src/types.ts`, `client/src/types.ts`

**Requires review:** false

Add `excluded_analytics_ips: string | null` to the `Settings` interface in both files, immediately after `track_returning_listeners: boolean` (matching the order columns were added in `migrate.ts`).

**Acceptance criteria:**
- [ ] Both interfaces updated identically (this repo keeps them in sync manually — no shared package).
- [ ] `cd client && npx tsc --noEmit` passes (nothing currently constructs a full `Settings` object without this field being optional-safe — confirm, since `Settings` fields are otherwise all required).

---

### Step 3: IP normalization/matching utility

**Files:** `server/src/utils/ipMatch.ts` (new), `server/tests/ipMatch.test.ts` (new)

**Requires review:** false

```ts
/**
 * Strips the IPv4-mapped-IPv6 prefix (e.g. "::ffff:203.0.113.5" ->
 * "203.0.113.5") so the same address matches regardless of which form a
 * given network path surfaces it as. Trims whitespace. Case-insensitive
 * on the "::ffff:" prefix; returns the input unchanged (trimmed) if it
 * doesn't match that shape.
 */
export function normalizeIp(ip: string): string {
  const trimmed = ip.trim()
  const match = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(trimmed)
  return match ? match[1] : trimmed
}

/** Parses a comma-separated IP list (as stored in
 *  settings.excluded_analytics_ips) into normalized, non-empty entries. */
export function parseExcludedIps(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw.split(',').map(normalizeIp).filter(Boolean)
}

/** True if `ip` matches any entry in the comma-separated `excludedRaw`
 *  list, after normalizing both sides. */
export function isExcludedIp(ip: string, excludedRaw: string | null | undefined): boolean {
  const excluded = parseExcludedIps(excludedRaw)
  return excluded.length > 0 && excluded.includes(normalizeIp(ip))
}
```

**Acceptance criteria:**
- [ ] `normalizeIp('::ffff:203.0.113.5')` returns `'203.0.113.5'`; `normalizeIp('203.0.113.5')` returns it unchanged; `normalizeIp('  203.0.113.5  ')` (whitespace) returns the trimmed value; a real IPv6 address (e.g. `'2001:db8::1'`) is returned unchanged (not mistaken for the mapped-v4 shape).
- [ ] `parseExcludedIps(null)` and `parseExcludedIps('')` both return `[]`. `parseExcludedIps('203.0.113.5, 198.51.100.9,,  ')` returns `['203.0.113.5', '198.51.100.9']` (blank segments from stray/trailing commas dropped).
- [ ] `isExcludedIp` matches exactly (not prefix/substring), matches across the `::ffff:` normalization on either side, and returns `false` for an empty/null list.
- [ ] `make test` (server) passes.

---

### Step 4: Enforce the exclusion in the public analytics endpoint

**Files:** `server/src/routes/analytics.ts`, `server/tests/analytics.test.ts`

**Requires review:** true — this is the actual privacy-enforcing logic; get it right before moving on.

Change the existing settings lookup (currently `SELECT analytics_enabled FROM settings`) to also fetch the new column in the same query, and add the exclusion check immediately after the existing `analytics_enabled` early return, before the crawler check:

```ts
const settingsRow = app.db.prepare('SELECT analytics_enabled, excluded_analytics_ips FROM settings').get() as
  { analytics_enabled: number; excluded_analytics_ips: string | null } | undefined
if (!settingsRow?.analytics_enabled) {
  return reply.status(204).send()
}

if (isExcludedIp(req.ip, settingsRow.excluded_analytics_ips)) {
  return reply.status(204).send()
}

if (isKnownCrawler(req.headers['user-agent'])) {
  return reply.status(204).send()
}
```
Add `import { isExcludedIp } from '../utils/ipMatch.js'` at the top. This applies uniformly to all four `event_type` values — no per-type branching needed, since the check happens before `event_type` is inspected at all.

**Acceptance criteria:**
- [ ] A request from an excluded IP (set via `app.inject({ ..., remoteAddress: '203.0.113.5' })`, matching the pattern already used in `server/tests/trust-proxy.test.ts` and `server/tests/admin-auth.test.ts`) with `settings.excluded_analytics_ips` set to include that IP returns 204 and inserts **no** row into `events` — assert via a direct `SELECT COUNT(*) FROM events` against the test DB, not just the response code.
- [ ] The same request from a *different*, non-excluded IP with the same settings *does* insert a row — proves the check isn't accidentally excluding everything.
- [ ] Test this for at least two different `event_type` values (e.g. `page_view` and `play_start`) to confirm the check isn't scoped to one type.
- [ ] An IPv4-mapped-IPv6 `remoteAddress` (`::ffff:203.0.113.5`) is correctly excluded when the stored setting is the plain `203.0.113.5` form (and vice versa).
- [ ] `excluded_analytics_ips` is `NULL` (the default/unset case) — existing behavior is completely unaffected, all existing `analytics.test.ts` cases still pass unchanged.
- [ ] `make test` (server) passes.

---

### Step 5: Allow the new field through admin settings writes

**Files:** `server/src/routes/admin/settings.ts`, `server/tests/admin-settings.test.ts`

**Requires review:** false

- Add `'excluded_analytics_ips'` to `ALLOWED_SETTINGS_PATCH_FIELDS`.
- `PUT /admin/settings`: destructure `excluded_analytics_ips = null` from the body, add it to the `INSERT` column list and values (as a plain string-or-null — no boolean coercion needed, unlike `analytics_enabled`/`track_returning_listeners`).
- `PATCH /admin/settings`: the existing generic `fields.map(...)` handling already writes `v === undefined ? null : v` for any field not specifically coerced — this covers `excluded_analytics_ips` correctly with no new branch needed, since an empty string from the client (see Step 7) becomes `null` at the *client* layer, not here.
- Add a light length guard alongside the existing `podcast_name`/`cover_art_path`/`favicon_path` validation in both handlers: `if (typeof updates.excluded_analytics_ips === 'string' && updates.excluded_analytics_ips.length > 500) return reply.status(400).send({ error: 'excluded_analytics_ips is too long' })` (500 chars comfortably fits a dozen-plus IPv6 addresses; this is a sanity cap, not IP-format validation — this codebase doesn't validate `TRUSTED_PROXY_IPS`'s shape either, and a malformed entry here only ever affects this operator's own dashboard accuracy, not a security boundary).

**Acceptance criteria:**
- [ ] `PATCH /api/admin/settings` with `{ excluded_analytics_ips: '203.0.113.5, 198.51.100.9' }` persists it and returns it in the response.
- [ ] `PATCH` with a 501-character string returns 400.
- [ ] `PUT /api/admin/settings` (full replace) with the field omitted defaults to `NULL`, matching existing optional-field behavior for `cover_art_path`/`favicon_path`.
- [ ] `GET /api/settings` (the **public**, unauthenticated route) response never includes `excluded_analytics_ips` — assert this explicitly with a test that sets the field via the admin route, then checks the public route's response does not contain the key at all (not just that it's null/undefined — the column must be absent from the `SELECT`).
- [ ] `make test` (server) passes.

---

### Step 6: `GET /api/admin/my-ip`

**Files:** `server/src/routes/admin/settings.ts`, `server/tests/admin-settings.test.ts`

**Requires review:** false

Add a small authenticated-only route to the same file (co-located with the setting it supports):
```ts
app.get('/admin/my-ip', { preHandler: requireAdmin }, async (req) => {
  return { ip: normalizeIp(req.ip) }
})
```
Import `normalizeIp` from `../../utils/ipMatch.js`. Returns the *normalized* form (not the raw `req.ip`) so what the admin sees and clicks "add" for is exactly the same string `isExcludedIp` will later compare against — showing the raw `::ffff:`-prefixed form would be confusing and wouldn't match.

**Acceptance criteria:**
- [ ] Unauthenticated request to `/api/admin/my-ip` returns 401 (via `requireAdmin`, same as every other admin route).
- [ ] Authenticated request returns `{ ip: '<normalized address>' }` matching the `remoteAddress` used in the test request.
- [ ] `make test` (server) passes.

---

### Step 7: Client API + Admin Settings UI

**Files:** `client/src/api.ts`, `client/src/pages/admin/AdminSettings.tsx`, `client/src/tests/AdminSettings.test.tsx`

**Requires review:** false

**`api.ts`:** add `export const getMyIp = () => adminRequest<{ ip: string }>('/api/admin/my-ip', 'GET')`, next to the other `getAnalytics*` exports.

**`AdminSettings.tsx`:**
- New state: `const [excludedIps, setExcludedIps] = useState('')` and `const [myIpError, setMyIpError] = useState('')`.
- In the `getSettings().then(...)` effect: `setExcludedIps(s.excluded_analytics_ips ?? '')`.
- New handler:
  ```ts
  async function handleAddMyIp() {
    setMyIpError('')
    try {
      const { ip } = await getMyIp()
      const current = excludedIps.split(',').map(s => s.trim()).filter(Boolean)
      if (!current.includes(ip)) {
        setExcludedIps([...current, ip].join(', '))
      }
    } catch (err) {
      setMyIpError(err instanceof Error ? err.message : 'Could not detect your IP')
    }
  }
  ```
- In `handleSubmit`'s `updateSettings(...)` call, add: `excluded_analytics_ips: excludedIps.trim() === '' ? null : excludedIps.trim()`.
- New field markup inside the existing `<div className="space-y-3 border-t ...">` "Analytics" section, after the `track_returning_listeners` block:
  ```tsx
  <div>
    <label htmlFor="excluded_analytics_ips" className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1">Excluded IPs</label>
    <div className="flex gap-2">
      <input id="excluded_analytics_ips" type="text" value={excludedIps}
        onChange={e => setExcludedIps(e.target.value)}
        placeholder="e.g. 203.0.113.5, 198.51.100.9"
        className="flex-1 rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100" />
      <button type="button" onClick={() => void handleAddMyIp()}
        className="shrink-0 rounded bg-zinc-200 dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600">
        Add my current IP
      </button>
    </div>
    {myIpError && <p className="text-sm text-red-600 dark:text-red-400 mt-1">{myIpError}</p>}
    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
      Comma-separated IP addresses excluded from all analytics events (page views and playback) — useful for keeping your own visits out of the dashboard.
    </p>
  </div>
  ```
  The "Add my current IP" button never submits the form (`type="button"`) and doesn't save on its own — it only populates the field; the admin still clicks the page's main "Save" button, consistent with every other field on this page.

**Acceptance criteria:**
- [ ] Loading existing settings with `excluded_analytics_ips: '203.0.113.5'` pre-fills the field.
- [ ] Clicking "Add my current IP" (mock `getMyIp` to resolve `{ ip: '198.51.100.9' }`) appends it to a non-empty existing value with `, ` separation, and doesn't duplicate an IP already present.
- [ ] Saving submits `excluded_analytics_ips: null` when the field is emptied (not an empty string).
- [ ] A failed `getMyIp()` call shows `myIpError` and doesn't crash or clear the existing field value.
- [ ] `make test` (client) passes.

---

### Step 8: Full quality gate

**Files:** none (verification only)

**Requires review:** false

Run `make test`, `make lint`, and (from `client/`) `npx tsc --noEmit`.

**Acceptance criteria:**
- [ ] `make test` fully green (server + client).
- [ ] `make lint` clean (server + client).
- [ ] `tsc --noEmit` clean.

## Testing

Server-side: new `server/tests/ipMatch.test.ts` (pure-function unit tests, no app needed) and extensions to `server/tests/analytics.test.ts` (the enforcement point — the highest-value tests in this plan, since this is the actual privacy behavior) and `server/tests/admin-settings.test.ts` (persistence, the public-endpoint non-leak guarantee, and the new `/admin/my-ip` route). Client-side: extensions to `client/src/tests/AdminSettings.test.tsx` for the new field and button. No e2e coverage is planned — this is an admin-configuration feature with no listener-facing UI change, and the actual enforcement (server-side IP matching) isn't meaningfully testable through a browser E2E test the way the existing suite's real-browser-audio-decoding limitations already push server-level logic toward Vitest instead (see CLAUDE.md's Testing gotchas).

## Notes

- **Why not a cookie-based "don't track me" opt-out instead of IP matching?** Considered and rejected: the user's request was specifically IP-based, and IP matching requires zero action from the admin on every browser/device they use (unlike a cookie, which would need re-visiting a special link on each device and survives only until cookies are cleared). The real limitation of IP-based exclusion — it silently stops working the moment the admin's ISP assigns them a new dynamic address, or they switch to mobile data — is exactly what the "Add my current IP" button mitigates: re-clicking it after a network change is a five-second fix, not a re-discovery problem.
- **Why no retroactive cleanup of past admin-origin events:** covered in Context above — the `events` table never stored raw IPs (by design, for listener privacy), so there is nothing to retroactively identify. If the admin wants a clean baseline going forward, `plans/003`-adjacent tooling or a manual `DELETE FROM events` (as already performed once this session, with the same backup-first discipline) is the only option — out of scope for this plan, which is prevention-only.
- **Why the field lives in the existing "Analytics" section of General Settings, not a new admin tab:** `analytics_enabled` and `track_returning_listeners` already live there; splitting one more closely-related analytics setting into a different tab (e.g. the separate Analytics *dashboard* tab, which is read-only reporting, not configuration) would be inconsistent with the existing settings/reporting split this app already has.
