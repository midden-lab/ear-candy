---
id: red-team-remediation
title: "Red Team Remediation — Batch 1 (Docs, Dependencies, Privacy & Auth Hardening)"
status: complete
priority: 1
created: 2026-08-29
steps_completed: 9
steps_total: 9
tags: [security, hardening, red-team, privacy, auth]
---

# Red Team Remediation — Batch 1

## Summary

Remediates the actionable findings from the 2026-08-30 five-agent red-team review (published composite report — see the session that produced this plan): 1 High, 6 Medium, and 3 Low-severity items spanning documentation drift, an unpatched dependency, a supply-chain over-scoped credential, an analytics privacy gap, a request-logging privacy gap, missing input validation, and two auth hardening gaps (session revocation, distributed brute-force throttling). Zero Critical findings were reported, and this plan deliberately excludes every Low/Informational item the report itself flagged as backlog-only, plus everything already tracked under an existing issue (#34, #37, #41, #102, #104).

## Context

- This is a hardening/remediation plan, not a new feature — every step fixes a real, already-diagnosed gap in existing code. No new user-facing capability is being designed here.
- Codebase areas touched: `server/src/app.ts` (Fastify app factory), `server/src/auth.ts` + `server/src/routes/admin/auth.ts` (session/login), `server/src/routes/analytics.ts` + `client/src/utils/analytics.ts` (first-party analytics, see `plans/001-first-party-analytics.md` for its original design), `server/src/routes/admin/episodes.ts`, `server/src/db/migrate.ts` (versioned migration pattern — see CLAUDE.md Database gotcha #5), root `Dockerfile`, `docs/runbooks/rotate-secrets.md`, `scripts/generate-secrets.sh`.
- **Branching/deploy convention (already used by `plans/001` and `plans/002` in this repo):** work happens on a branch off `dev`, PR into `dev`, merge; a separate `dev`→`main` promotion PR (squash-merge) is what actually triggers a real deploy. Per this plan's own sequencing note below, expect this to ship as multiple PRs, not one — group steps 1-4 into an early PR, and treat steps 5-9 as later, separate PRs given their review gates.
- **Migration pattern (Step 7 only):** `server/src/db/migrate.ts` uses a numbered `MIGRATIONS` array of guarded, additive `ALTER TABLE ... ADD COLUMN` steps, each with an `alreadyApplied` check and an `up` function, tracked in `schema_migrations`. The next available version is **6** (versions 1-5 are already used — see the file). Follow this pattern exactly; do not invent a new migration mechanism.
- **Existing allowlist-validation pattern to mirror (Step 4's INPUT-1 part):** `server/src/routes/analytics.ts`'s `ALLOWED_EVENT_TYPES = new Set([...])` checked in `isValidBody` is the established pattern for validating a string enum before it reaches a DB `CHECK` constraint. `server/src/routes/admin/episodes.ts` does not yet do this for `audio_type`.
- **Existing session-cookie mechanism (Step 7):** `server/src/auth.ts`'s `buildSessionCookieValue()` returns a signed cookie value shaped `authenticated:<issued-at-epoch-ms>`; `requireAdmin` unsigns it, splits on `:`, and checks the marker + a 24h max-age against `Date.now()`. There is currently no way to invalidate a still-unexpired cookie server-side — this is tracked as open issue **#34** ("no session revocation / sign out everywhere"). Step 7 closes #34.
- **Existing per-IP lockout (Step 8):** `server/src/routes/admin/auth.ts` already has a `failedAttempts` Map keyed by `req.ip`, 10 attempts / 15-minute window, scoped to the plugin instance (fresh per `buildApp()` call, including each test). Step 8 adds a second, IP-independent counter alongside it — it does not replace or restructure the existing one.
- **No local Node/npm in this dev environment** (per CLAUDE.md's Environment notes) — every `npm`/`node` command in this plan's steps must run via the project's established pattern: `docker run -v "$(pwd)/<pkg>:/app" -w /app node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 npm <command>` (mind the documented phantom-mount bug: never pass a `<pkg>`-relative bind-mount while `cwd` is already inside that package directory).

## Steps

### Step 1: Fix the stale unbound port in the emergency secret-rotation runbook

**Files:** `docs/runbooks/rotate-secrets.md`
**Requires review:** false

Fixes INFRA-1 (High). The `deploy` job (`.github/workflows/ci-cd.yml`) and `docker-compose.prod.yml` were already fixed this session (issue #81, `plans/002-restrict-port-3000-to-loopback.md`, merged) to publish the app container as `-p 127.0.0.1:3000:3000` instead of the unbound `-p 3000:3000`. This runbook's "manual emergency rotation" `docker run` example (line ~71) was missed and still shows the old, unbound form — an operator following it verbatim during an incident would silently reintroduce #81 at the worst possible moment.

Change:
```
  -p 3000:3000 \
```
to:
```
  -p 127.0.0.1:3000:3000 \
```
in the `docker run` block under "If you need to rotate outside of a normal deploy". Add a one-line comment immediately above the `docker run` block (or inline, matching this doc's existing prose style — it's markdown, not YAML, so a short parenthetical sentence is more natural than a code comment) noting that the port is loopback-only per issue #81, mirroring the binding already used by the `deploy` job and `docker-compose.prod.yml`.

**Acceptance criteria:**
- [ ] The manual `docker run` example reads `-p 127.0.0.1:3000:3000 \`
- [ ] A note referencing issue #81 explains why, immediately adjacent to the changed line
- [ ] No other content in the file changed

---

### Step 2: Patch server dependency advisories

**Files:** `server/package.json`, `server/package-lock.json`
**Requires review:** false

Fixes DEP-2 (Medium — `@fastify/static@10.1.0`, GHSA-8pvw-jcv7-9cmj and GHSA-83w8-p2f5-377r, fixed in 10.1.2), DEP-3 (Low — nested `fast-uri` host-confusion advisory), and DEP-4 (Low — transitive `find-my-way` HTTP/2 advisory, fixed upstream at 9.7.0, well within fastify's own dependency range). All three are resolvable within `server/`'s existing `^` semver ranges — no major version bump expected.

1. Run `npm audit` in `server/` first (via the Docker pattern in Context) to confirm the current advisory list matches these three (plus any newly-disclosed ones — patch those too if they're non-breaking; if audit fix wants to jump `@fastify/static`, `fastify`, or `find-my-way` to a new major version, stop and flag it rather than forcing it through, since that would be a breaking-change decision outside this step's scope).
2. Run `npm audit fix` in `server/`.
3. Run `npm test` (166 tests) and `npm run lint` in `server/` — both must pass unchanged.
4. Run `npm audit` again in `server/` to confirm the three advisories are gone.

**Acceptance criteria:**
- [ ] `npm audit` in `server/` no longer reports the `@fastify/static`, `fast-uri`, or `find-my-way` advisories
- [ ] `package-lock.json` is updated with no major-version bump on any direct dependency
- [ ] `npm test` (166 tests) passes
- [ ] `npm run lint` passes

---

### Step 3: Narrow the documented GHCR_PAT scope

**Files:** `scripts/generate-secrets.sh`
**Requires review:** false

Fixes INFRA-2 (Medium). The `deploy` job only ever does `docker login` + `docker pull` with `GHCR_PAT` (read-only) — image push already uses the ephemeral `GITHUB_TOKEN`, not this PAT. `scripts/generate-secrets.sh` (line ~45) currently instructs whoever runs it to create a token with `read:packages, write:packages, delete:packages` — broader than the deploy job ever uses, and a needlessly large blast radius for a long-lived credential that's also transmitted over SSH on every deploy.

Change line 45 from:
```
echo "Required scopes: read:packages, write:packages, delete:packages"
```
to:
```
echo "Required scopes: read:packages (read-only — the deploy job only pulls images; pushing to GHCR uses the ephemeral GITHUB_TOKEN, not this PAT)"
```

This only fixes the *documentation* a future token generation follows. The currently-live `GHCR_PAT` GitHub secret was created under the old (broader) instructions — narrowing its actual scope on GitHub's token settings page is a manual account-settings action outside what this plan automates. Note this explicitly in the PR description for this step so the user can do it separately.

**Acceptance criteria:**
- [ ] The script's echoed scope instructions read `read:packages` only, with the read-only rationale inline
- [ ] No other line in the script changed
- [ ] PR description (or commit message) for this change notes that the *live* PAT's scope still needs manual narrowing via GitHub's UI, as a followup outside this script

---

### Step 4: Low-severity polish batch (audio_type validation, stale localStorage identifier, raw referrer capture)

**Files:** `server/src/routes/admin/episodes.ts`, `server/src/routes/analytics.ts`, `client/src/utils/analytics.ts`
**Requires review:** false

Three small, independent, non-breaking fixes bundled into one step (all Low severity, no auth/schema/production-runtime impact):

**INPUT-1 — `server/src/routes/admin/episodes.ts`:** `audio_type` is currently only enforced by the DB's `CHECK(audio_type IN ('upload','url'))` constraint, uncaught, surfacing as a raw 500 with internal SQLite error text instead of a clean 400. Add:
```ts
const ALLOWED_AUDIO_TYPES = new Set(['upload', 'url'])
```
near the top of the file (same pattern as `ALLOWED_EVENT_TYPES` in `server/src/routes/analytics.ts`). In the `POST /admin/episodes`, `PUT /admin/episodes/:id`, and `PATCH /admin/episodes/:id` handlers, validate `audio_type` (when present — required in POST/PUT, optional in PATCH) against this set before it reaches any DB write, returning `reply.status(400).send({ error: 'Invalid audio_type' })` on a mismatch. Place the check alongside the existing `title`/`duration_seconds`/`isValidMediaPath` validation block in each handler, same ordering convention (validate-then-write).

**PRIV-3 — `client/src/utils/analytics.ts`:** Disabling "track returning listeners" (`track_returning_listeners: false`) currently only changes which storage `getSessionId` reads going forward — a previously-written `localStorage` identifier is never deleted, so it resumes correlating history if the setting is later re-enabled. In `loadConfig()`'s `.then()` callback, after computing the resolved config, proactively clear the persistent identifier when returning-listener tracking is off:
```ts
if (!config.trackReturning) {
  try { window.localStorage.removeItem(SESSION_STORAGE_KEY) } catch { /* ignore */ }
}
```
placed so it runs once per page load (this function is already memoized via `configPromise`), before returning `config`. Wrap in try/catch since `localStorage` access can throw in some browser privacy modes (this file already treats storage access as fallible elsewhere in the codebase's conventions).

**PRIV-4 — `client/src/utils/analytics.ts` + `server/src/routes/analytics.ts`:** `document.referrer` is currently captured and stored raw (up to 500 chars), which can carry PII-bearing query strings from newsletter/campaign links. Add a small helper in `client/src/utils/analytics.ts`:
```ts
function sanitizeReferrer(referrer: string): string | undefined {
  try {
    return new URL(referrer).origin
  } catch {
    return undefined
  }
}
```
and use it in `trackPageView()`:
```ts
const referrer = params.get('ref') === 'share' ? 'share-link' : (document.referrer ? sanitizeReferrer(document.referrer) : undefined)
```
(replacing the current `document.referrer || undefined`). Server-side, in `server/src/routes/analytics.ts`, tighten `MAX_REFERRER_LENGTH` from `500` to `200` — origins and the `'share-link'` literal are both well under this, and it narrows (defense-in-depth only, since a non-browser API caller can still send an arbitrary string up to the cap — that's INPUT-2, explicitly out of scope) the worst case for anything that does slip through.

**Acceptance criteria:**
- [ ] POSTing/PUTting/PATCHing an episode with an invalid `audio_type` (e.g. `"mp3"`) returns 400 with `{ error: 'Invalid audio_type' }`, not a 500
- [ ] Existing valid `audio_type` values (`'upload'`, `'url'`) still save successfully in all three handlers
- [ ] With `track_returning_listeners: false`, a pre-existing `localStorage` entry under `ec_session_id` is removed after the next `loadConfig()` resolution
- [ ] `trackPageView()` sends only the origin portion of `document.referrer` (e.g. `https://example.com`, never a full path/query string), or `'share-link'` for `?ref=share` links
- [ ] `server/src/routes/analytics.ts`'s `isValidBody` rejects a `referrer` longer than 200 characters
- [ ] `server/tests/admin-episodes.test.ts`, `server/tests/analytics.test.ts`, and `client/src/tests/analytics.test.ts` updated/extended to cover the above; full `npm test` passes in both `server/` and `client/`

---

### Step 5: Stop persisting raw client IPs in request logs

**Status (2026-09-12): implemented**, via `plans/017-open-source-audit-blockers.md` (Steps 1-2) — `disableRequestLogging: true` added to `buildApp()`, with test coverage confirming both halves (no automatic request-log line for a plain request; the deliberate `admin_login`/`admin_logout` lines are unaffected). This plan (1-9) is now genuinely fully complete, not just marked so.

Historical note, kept for context: as of 2026-08-30 this step was not yet implemented. Steps 6-9 were completed and merged to `dev` out of order, at explicit user direction (`/goal execute the plan and implement 6-9`), deliberately skipping this step at the time. The frontmatter's `steps_completed: 9`/`status: complete` predated this step's actual implementation by about two weeks — a discrepancy caught during a later open-source-readiness audit, not by this plan's own tracking.

**Files:** `server/src/app.ts`
**Requires review:** true — this is a logging-behavior change with a real privacy implication; the two viable approaches (disable automatic request logging vs. redact specific fields) trade off differently and deserve a deliberate choice, not a silent one.

Fixes PRIV-1 (Medium). `buildApp()` constructs Fastify with `logger: opts.logger ?? true` and no other logging config — this enables Fastify's *automatic* per-request pino log lines (`"incoming request"` / `"request completed"`), which include `req.remoteAddress` (raw client IP) for every request, including the public analytics endpoint. In production this is captured to disk via Docker's `json-file` log driver and survives until the next deploy. This directly contradicts the analytics feature's own design claim (`server/src/utils/geoip.ts`'s `resolveCountry` doc comment) that the client IP is "resolved then discarded, never persisted" — that module itself is fine; the gap is this ambient automatic logging elsewhere in the stack.

**Recommended fix:** add `disableRequestLogging: true` to the `Fastify(...)` constructor call in `buildApp()`:
```ts
const app = Fastify({
  logger: opts.logger ?? true,
  disableRequestLogging: true,
  trustProxy: resolveTrustedProxies(process.env.TRUSTED_PROXY_IPS)
})
```
This disables only Fastify's *automatic* onRequest/onResponse log lines — it does not disable `req.log` itself, so every place this codebase already logs deliberately (`server/src/routes/admin/auth.ts`'s `req.log.info({ event: 'admin_login', outcome, ip: req.ip })` and `{ event: 'admin_logout', ip: req.ip }`, per CLAUDE.md gotcha #10a) is completely unaffected and keeps logging exactly as before, including the IP where that's an intentional, scoped forensic signal. Add a comment above the option explaining why (references PRIV-1 / the analytics IP-discard claim), matching this file's existing dense-comment style (see the `TRUSTED_PROXY_IPS` comment a few lines above as the pattern to match).

Before implementing, confirm no other part of the codebase relies on the automatic request log for anything real (grep for reliance on Fastify's default request-log fields in tests or ops tooling) — if something does, surface that to the user via the review gate rather than proceeding silently.

**Acceptance criteria:**
- [ ] `buildApp()` passes `disableRequestLogging: true` to `Fastify(...)`, with an explanatory comment
- [ ] A new or extended server test confirms a plain request (e.g. `GET /api/health`) produces no automatic pino log line containing `req`/`remoteAddress`/`incoming request` (capture logger output via a custom pino stream in the test, matching whatever pattern `server/tests/helpers.ts` already uses for building a test app)
- [ ] A test confirms admin login success/failure and logout still produce their existing explicit `event: 'admin_login'`/`admin_logout'` log lines with `ip`, unchanged (extend `server/tests/admin-auth.test.ts` if it doesn't already assert this)
- [ ] `npm test` passes in `server/`

---

### Step 6: Add an in-app analytics disclosure

**Files:** `client/src/components/PrivacyNotice.tsx` (new), `client/src/components/EpisodeListView.tsx`, `client/src/components/EpisodeList.tsx`, `client/src/App.tsx`
**Requires review:** true — placement and wording are a real design decision affecting every listener's first impression of the app; get sign-off before committing to specific copy/UI.

**Status:** done — merged to `dev` via PR #113 (2026-08-30).

Fixes PRIV-2 (Medium). With shipped defaults (`analytics_enabled: true`, `track_returning_listeners: true`), a listener's first page load writes a persistent cross-session `localStorage` identifier with zero in-app notice — the only disclosure lives in `README.md`, which listeners never see. Both toggles are admin-only (`client/src/pages/admin/AdminSettings.tsx`). This is a real gap for any privacy-conscious or EU-facing deployment of this open-source app.

`EpisodeList` (`client/src/components/EpisodeList.tsx`) wraps the presentational `EpisodeListView` and is rendered by `App.tsx` as **both** the desktop sidebar and, unmodified, the mobile "list" pane (`AppShell`'s `sidebar` prop serves both — see `AppShell.tsx`) — so a disclosure placed at the bottom of this component's rendered output reaches both layouts with a single insertion point, no separate mobile wiring needed.

1. Create `client/src/components/PrivacyNotice.tsx`:
```tsx
interface PrivacyNoticeProps {
  analyticsEnabled: boolean
}

export default function PrivacyNotice({ analyticsEnabled }: PrivacyNoticeProps) {
  if (!analyticsEnabled) return null
  return (
    <details className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-800">
      <summary className="cursor-pointer select-none">Anonymous listening analytics</summary>
      <p className="mt-2 leading-relaxed">
        This site anonymously tracks page views and playback (episode, device/browser type, and a
        country resolved from your IP address, which is never stored). No data is shared with or
        sent to any third party.
      </p>
    </details>
  )
}
```
(Wording is a starting point for the review gate, not final — confirm tone/copy with the user before merging, per this step's review gate. `<details>/<summary>` matches this app's no-router constraint — no new page/route needed for progressive disclosure, consistent with how `ShareDialog.tsx` and similar already avoid needing routing.)

2. Thread `analyticsEnabled: boolean` down: `App.tsx` already has `settings.analytics_enabled` in scope (from its existing `getSettings()` call) — pass it as a new prop to `EpisodeList`, which passes it through to `EpisodeListView`, which renders `<PrivacyNotice analyticsEnabled={analyticsEnabled} />` once, after the episode list content (read `EpisodeListView.tsx`'s current JSX structure first to find the right insertion point — likely just inside its outermost scrollable container, after the season tabs/episode rows).

**Acceptance criteria:**
- [ ] A collapsed-by-default, always-visible ("Anonymous listening analytics") disclosure line renders at the bottom of the episode list on both desktop and mobile, expanding to a short explanation on click
- [ ] The notice renders nothing (`null`) when `settings.analytics_enabled` is `false`
- [ ] New test `client/src/tests/PrivacyNotice.test.tsx` covers both the enabled and disabled render paths
- [ ] `client/src/tests/EpisodeList.test.tsx` and/or `EpisodeListView.test.tsx` updated to cover the new prop being threaded through
- [ ] `npm test` and `npm run lint` pass in `client/`

---

### Step 7: Add server-side session revocation on logout

**Files:** `server/src/db/migrate.ts`, `server/src/auth.ts`, `server/src/routes/admin/auth.ts`
**Requires review:** true — auth-sensitive logic and a schema change; get explicit sign-off on the mechanism before implementing.

**Status:** done — merged to `dev` via PR #114 (2026-08-30). Issue #34 will close automatically once this reaches `main` (GitHub's closing-keyword linking only fires against the repo's default branch).

Fixes AUTH-1 (Medium), closes issue **#34**. Sessions are a stateless signed cookie (`authenticated:<issued-at-epoch-ms>`) with a 24h server-enforced expiry (`server/src/auth.ts`) but no server-side revocation store. `POST /admin/logout` (`server/src/routes/admin/auth.ts`) only clears the browser-side cookie — a copy of a valid signed cookie obtained any other way (XSS, a compromised browser profile, a captured log — see Step 5) stays fully valid for up to 24h after the legitimate admin logs out, with no way to forcibly kill it.

This app has exactly one admin and one singleton `settings` row (CLAUDE.md Database gotcha #8: always exactly one row, `DELETE FROM settings` + `INSERT` pattern) — a single monotonic "session epoch" on that row is sufficient to invalidate every outstanding session at once on logout, with no need for a full session-store table.

1. **Migration** (`server/src/db/migrate.ts`), version 6:
```ts
{
  version: 6,
  description: 'settings.session_epoch',
  alreadyApplied: db => columnExists(db, 'settings', 'session_epoch'),
  up: db => { db.prepare('ALTER TABLE settings ADD COLUMN session_epoch INTEGER NOT NULL DEFAULT 0').run() },
},
```
Append to the `MIGRATIONS` array (do not reorder existing entries).

2. **`server/src/auth.ts`:** change `buildSessionCookieValue` to embed the epoch at issuance:
```ts
export function buildSessionCookieValue(epoch: number): string {
  return `${SESSION_MARKER}:${Date.now()}:${epoch}`
}
```
Update `requireAdmin` to parse and check the epoch. It needs DB access, available via `req.server.db` (Fastify decorates `db` on the app instance; `req.server` is that same instance — no signature change needed, `requireAdmin` stays a plain `(req, reply) => Promise<void>`):
```ts
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const raw = req.cookies['admin_session'] ?? ''
  if (!raw) return reply.status(401).send({ error: 'Unauthorized' })
  const result = req.unsignCookie(raw)
  if (!result.valid || !result.value) return reply.status(401).send({ error: 'Unauthorized' })
  const [marker, issuedAtStr, epochStr] = result.value.split(':')
  const issuedAt = Number(issuedAtStr)
  const epoch = Number(epochStr)
  if (marker !== SESSION_MARKER || !Number.isFinite(issuedAt) || !Number.isFinite(epoch)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
  if (Date.now() - issuedAt > SESSION_MAX_AGE_MS) return reply.status(401).send({ error: 'Unauthorized' })
  const row = req.server.db.prepare('SELECT session_epoch FROM settings').get() as { session_epoch: number } | undefined
  if (!row || row.session_epoch !== epoch) return reply.status(401).send({ error: 'Unauthorized' })
}
```
A cookie issued before this change (`authenticated:<ts>`, no third segment) fails the `Number.isFinite(epoch)` check cleanly — 401, not a crash — the same intentional forced-logout-on-deploy behavior already established for the original 24h-expiry rollout (CLAUDE.md gotcha #9). Document this consequence the same way gotcha #9 does, either as a new CLAUDE.md gotcha or an inline comment — see this step's acceptance criteria.

3. **`server/src/routes/admin/auth.ts`:**
   - In `POST /admin/login`, after a successful password check, read the current epoch before issuing the cookie: `const { session_epoch } = app.db.prepare('SELECT session_epoch FROM settings').get() as { session_epoch: number }`, then `buildSessionCookieValue(session_epoch)`.
   - In `POST /admin/logout`, bump the epoch (invalidating every outstanding session, including the one making this request) before/alongside clearing the cookie: `app.db.prepare('UPDATE settings SET session_epoch = session_epoch + 1').run()`.

4. Update CLAUDE.md gotcha #9 (or add a new numbered gotcha immediately after it) documenting the new `session_epoch` mechanism and that logout now genuinely revokes server-side, not just client-side — this is exactly the kind of non-obvious auth-invariant change CLAUDE.md exists to capture.

**Acceptance criteria:**
- [ ] A fresh `:memory:` test DB migrates cleanly to `schema_migrations` version 6
- [ ] After login, calling `/admin/logout` then replaying the *original* (now-stale) session cookie against any admin route returns 401
- [ ] A cookie issued before this change (`authenticated:<ts>`, no epoch segment) is rejected with 401, not a 500
- [ ] A still-valid, current-epoch session cookie continues to authenticate normally (no false-positive lockout of the legitimate session that just logged in)
- [ ] `server/tests/admin-auth.test.ts` and `server/tests/migrate.test.ts` extended to cover all of the above
- [ ] `npm test` passes in `server/`
- [ ] Issue #34 closed, referencing the merged PR, once this ships to production

---

### Step 8: Add a global brute-force throttle alongside the existing per-IP lockout

**Files:** `server/src/routes/admin/auth.ts`
**Requires review:** true — auth-sensitive logic; confirm the chosen ceiling/cooldown values before implementing.

**Status:** done — merged to `dev` via PR #115 (2026-08-30), with the ceiling/cooldown values from this step's own text (30 attempts/30min) as written, not altered at review.

Fixes AUTH-2 (Medium). The existing lockout (`failedAttempts` Map, `MAX_FAILED_ATTEMPTS = 10`, `LOCKOUT_WINDOW_MS = 15 * 60 * 1000`) is keyed strictly by `req.ip`. This app has exactly one credential gating full content control, with no secondary global cap — an attacker with access to multiple apparent source IPs gets a fresh 10-attempt allowance per address, so distributed guessing is only lightly slowed in aggregate.

Add a second, IP-independent counter in the same plugin scope, checked alongside (not instead of) the existing per-IP one:
```ts
const GLOBAL_MAX_FAILED_ATTEMPTS = 30
const GLOBAL_LOCKOUT_WINDOW_MS = 30 * 60 * 1000

let globalFailed: { count: number; resetAt: number } | null = null

function isGloballyLockedOut(): boolean {
  if (!globalFailed) return false
  if (Date.now() > globalFailed.resetAt) {
    globalFailed = null
    return false
  }
  return globalFailed.count >= GLOBAL_MAX_FAILED_ATTEMPTS
}

function recordGlobalFailedAttempt(): void {
  if (!globalFailed || Date.now() > globalFailed.resetAt) {
    globalFailed = { count: 1, resetAt: Date.now() + GLOBAL_LOCKOUT_WINDOW_MS }
  } else {
    globalFailed.count += 1
  }
}
```
In `POST /admin/login`: check `isGloballyLockedOut()` alongside the existing `isLockedOut(req.ip)` check at the top of the handler (either lockout returns the existing 429 response — no need to distinguish which one tripped in the response body, to avoid giving an attacker a global-vs-per-IP signal). Call `recordGlobalFailedAttempt()` alongside the existing `recordFailedAttempt(req.ip)` on a failed password match. On success, there is no need to reset the global counter (unlike the per-IP one) — a single successful login from one IP shouldn't wipe out evidence of a concurrent distributed attack from others; let it expire naturally via `resetAt`.

Values chosen (30 attempts / 30 minutes, vs. the per-IP 10/15) are deliberately higher than the per-IP ceiling — this is a backstop against *distributed* guessing across many IPs, not a tighter version of the existing per-IP control; a real single legitimate admin occasionally mistyping their password from one IP should essentially never trip this second counter on its own. Confirm these specific numbers at the review gate — they're a reasonable default, not a hard requirement.

**Acceptance criteria:**
- [ ] 30 failed login attempts from 30 distinct spoofed/simulated source IPs (well under each individual IP's own 10-attempt ceiling) trips the global lockout and returns 429
- [ ] A single IP's own 10-attempt/15-minute lockout still triggers independently and unchanged (existing behavior/tests unaffected)
- [ ] A successful login from one IP does not clear the global counter's accumulated failures from other IPs
- [ ] The global counter naturally resets after its 30-minute window elapses
- [ ] `server/tests/admin-auth.test.ts` extended to cover the above
- [ ] `npm test` passes in `server/`

---

### Step 9: Bump the production base image off EOL Node 20

**Files:** `Dockerfile`
**Requires review:** true — changes the production runtime; confirm before merging, and treat this as its own PR separate from the others in this plan given the blast radius.

**Status:** done — merged to `dev` via PR #116 (2026-08-30). Verified locally (full `docker build` through all 4 stages including native-addon compilation, plus a live container smoke test against `/api/health`) and confirmed again by CI's own `build` job on `dev`. **Not yet promoted to `main`** — this step's own text scopes it to getting the change into `dev`; the `dev`→`main` promotion that would actually deploy this to production was deliberately left as a separate, explicitly-confirmed action given the runtime-level nature of the change.

Fixes DEP-1 (Medium-High). All 4 stages of the root `Dockerfile` use `node:20-alpine`, pinned by digest. Node.js 20 reached end-of-life on 2026-04-30 (confirmed via the Node.js Release Working Group and independent EOL trackers, as of this plan's writing) — any Node/OpenSSL CVE disclosed since then has no official upstream fix on this image, and this is the actual production runtime (`Dockerfile`'s `runner` stage, deployed via CI's `build`/`deploy` jobs).

1. Resolve the current digest for `node:22-alpine` (Active LTS at time of writing — prefer 22 over 24 unless the user's review gate response says otherwise, since 22 is the more conservative/stable choice for a production bump) the same way this repo's CI already resolves image digests (`docker buildx imagetools inspect node:22-alpine`, or equivalent — do not hand-type a SHA).
2. Update all 4 `FROM node:20-alpine@sha256:...` lines to `FROM node:22-alpine@sha256:<new-digest>`, keeping each stage's existing `AS <name>` alias unchanged.
3. Rebuild locally to confirm the native-addon compilation stage (`deps`, which installs `bcrypt` and `better-sqlite3` under Alpine via `apk add python3 make g++`) still succeeds under Node 22 — this is the step most likely to need attention, since native addons can have Node-ABI-version sensitivity. Use this repo's existing local Docker testing pattern (see Context) to run the build: `docker build -t ear-candy:node22-test .` (or the equivalent `make build-prod` target) and confirm it completes without error.
4. Run the full test suite (`make test`) and full E2E suite (`make e2e`, after `make up` — note this rebuilds the dev-stack images too, which are unaffected since `server/Dockerfile.dev`/`client/Dockerfile.dev` are separate, unpinned dev-only images per CLAUDE.md gotcha #33a and are explicitly out of scope for this step) against the updated image to confirm nothing else regressed.
5. Update the digest comment/version reference anywhere else in the repo that documents the current pinned Node version, if any (grep for `node:20-alpine` across the repo — expect only `Dockerfile` itself, per the existing docs, but verify).

**Acceptance criteria:**
- [ ] All 4 `FROM` lines in `Dockerfile` reference `node:22-alpine` pinned to a real, freshly-resolved digest (not hand-typed)
- [ ] `docker build -t ear-candy:node22-test .` (or `make build-prod`) completes successfully, including the native-addon compilation stage
- [ ] `make test` passes against the rebuilt image where applicable, and unit tests pass regardless (they don't depend on the Docker image directly)
- [ ] `make e2e` passes against the rebuilt production image (mirrors how CI's `e2e` job already exercises the production image, not the dev stack)
- [ ] No remaining reference to `node:20-alpine` anywhere in the repository

## Testing

- Steps 1-3 are documentation/config-text changes with no test surface of their own — verified by direct inspection (Step 1, 3) and `npm audit` + the existing test suite (Step 2).
- Step 4 extends existing unit test files (`server/tests/admin-episodes.test.ts`, `server/tests/analytics.test.ts`, `client/src/tests/analytics.test.ts`) rather than adding new ones — each fix is a small, independently testable behavior change to code already under test.
- Step 5 needs a new logging-behavior assertion (capturing pino output) — extend `server/tests/admin-auth.test.ts` for the "explicit logs unaffected" half, and add a small dedicated test (new file or extend an existing app-level test) for the "automatic request logging is off" half.
- Step 6 needs a new component test file (`client/src/tests/PrivacyNotice.test.tsx`) plus updates to whatever existing tests cover `EpisodeList`/`EpisodeListView`'s prop surface.
- Steps 7 and 8 both extend `server/tests/admin-auth.test.ts` — this file already sets up the login/lockout testing scaffolding (`process.env.ADMIN_PASSWORD_HASH`, `app.inject()` calls) needed for both. Step 7 additionally touches `server/tests/migrate.test.ts` for the new migration.
- Step 9 has no unit-test surface of its own — it's verified entirely by the build and full `make test`/`make e2e` suites succeeding against the rebuilt image, per that step's own acceptance criteria.

## Notes

- **Sequencing:** Steps 1-4 are cheap, independent, and non-review-gated — land these first, likely as a single early PR, to bank real fixes quickly. Steps 5-9 each carry a review gate and are individually more consequential (logging behavior, user-facing copy, auth semantics, production runtime) — expect these to ship as separate PRs so each gets focused review, not bundled into one large diff. This mirrors how `plans/001` and `plans/002` were both executed and promoted in this repo.
- **Explicitly out of scope, already tracked elsewhere — do not duplicate:** issue #37 (backups not offsite), #41 (no in-app password rotation), #102 (analytics events retention), #104 (dev-targeting PRs skip pre-merge CI). Also out of scope as Low/Informational backlog-only per the red-team report's own priority section: AUTH-3 (unpruned failed-attempt map — minor memory growth, not user-facing), AUTH-4 (hidden media reachable by direct URL if a link was shared before hiding), INPUT-2 (no Origin/Referer check on the analytics endpoint), INPUT-3 (= issue #102), PRIV-5 (analytics bot-filter is narrower than a general crawler list), INFRA-3 (no host firewall as defense-in-depth beyond the loopback bind), INFRA-4 (dead `client/Dockerfile`/`nginx.conf`), INFRA-5 (dev compose file has no "don't run on a public host" comment), DEP-5 (Vitest `--ui` advisory, dev-only, never used), DEP-6 (client devDependency-only findings, prod tree is clean).
- **Step 7's mechanism choice (session_epoch on the singleton settings row) was chosen over a dedicated sessions table** because this app has exactly one admin credential and one session ever meaningfully "active" at a time (CLAUDE.md: "No user model... Only one admin password hash") — a full session store would be solving for a multi-session/multi-user scenario this app doesn't have. If multi-admin support is ever added, this mechanism would need revisiting (a per-session-not-global epoch), but that's a hypothetical outside this plan's scope, not a reason to over-build now.
- **Step 8's global-lockout ceiling (30/30min) is intentionally higher than the per-IP one (10/15min)**, not a tighter version of it — the two controls address different threats (single-IP credential stuffing vs. distributed guessing) and conflating their thresholds would make the per-IP control either too loose (if raised to match) or the global one too likely to false-positive on legitimate concurrent traffic (if lowered to match).
- **Step 9 defaults to Node 22 (Active LTS) over Node 24** as the more conservative production choice; if the user prefers jumping straight to 24 at the review gate, that's a one-line change to the target tag with no other plan impact.
