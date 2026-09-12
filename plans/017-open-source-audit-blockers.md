---
id: open-source-audit-blockers
title: "Resolve open-source-readiness audit blockers (PRIV-1, dependency CVEs) + non-blockers"
status: complete
priority: 1
created: 2026-09-12
steps_completed: 6
steps_total: 6
tags: [security, privacy, dependencies, open-source]
---

# Resolve Open-Source-Readiness Audit Blockers

## Summary

Fixes the two blockers found in this session's pre-open-sourcing security/privacy audit — Fastify's automatic request logging still persists raw client IPs in production despite `plans/003`'s frontmatter falsely claiming this was already fixed, and two dependencies (`fastify`, `sharp`) have actually-installed, known CVEs — plus the two suggested non-blockers (a `SECURITY.md` and correcting `plans/003`'s stale status). No listener- or admin-facing behavior changes; this is entirely security/privacy/documentation hygiene ahead of making the repo public.

## Context

**Blocker 1 — PRIV-1 (raw client IP in automatic request logs):** `server/src/app.ts`'s `buildApp()` constructs Fastify with `logger: opts.logger ?? true` and nothing else — this leaves Fastify's *automatic* per-request pino log lines enabled, which include `req.remoteAddress` for every request, including public analytics endpoint hits. This contradicts `server/src/utils/geoip.ts`'s own doc comment claiming the client IP is "resolved then discarded, never persisted." In production these lines are captured to disk via Docker's `json-file` log driver and survive until the next deploy.

This is not a new finding — `plans/003-red-team-remediation.md`'s own Step 5 (lines 147-173) already fully specifies the fix, with a dated status note explicitly saying it was deliberately left unimplemented when steps 6-9 were done out of order. **That plan's frontmatter (`status: complete, steps_completed: 9`) is currently wrong** — Step 5 was never actually done; verified directly against `server/src/app.ts`, which has no `disableRequestLogging` anywhere. Step 1 below implements exactly what plan 003's Step 5 already specified; do not re-derive the approach, follow it as written.

**Blocker 2 — dependency CVEs, both already within the declared semver range:**
- `fastify`: `server/package.json` declares `^5.10.0`; the vulnerable installed version is `5.10.0` per `server/package-lock.json`, but `5.12.4` (patched, confirmed via `npm view fastify versions`) is already inside that same `^5.10.0` range. This is a **lockfile-only update**, not a `package.json` version-range change and not a major bump. Two advisories affect the installed version: a schema-validation-bypass bug, and an X-Forwarded-For-spoofing-under-`trustProxy`-hop-count bug — the second is directly relevant here, since this app's login lockout (`server/src/routes/admin/auth.ts`), the IP-exclusion feature (`server/src/routes/analytics.ts`), and geo-analytics all depend on `trustProxy`/`req.ip` being trustworthy.
- `sharp`: `server/package.json` declares `^0.35.3`; the vulnerable installed version is `0.35.3`, but `0.35.4` (patched, fixes libheif CVEs) is already inside that same `^0.35.3` range. Also lockfile-only, no `package.json` change, no major bump. `sharp` is used for admin-uploaded cover-art/favicon image processing (`server/src/routes/admin/upload-image.ts`, `upload-favicon.ts`) — attack surface requires an authenticated admin account, but the library itself parses untrusted bytes.

**Non-blocker 1 — no `SECURITY.md`:** confirmed via `ls` that none of `SECURITY.md`/`CONTRIBUTING.md`/`CODE_OF_CONDUCT.md` exist. Decided (not left open): use GitHub's built-in Private Vulnerability Reporting, not an email address — this repo just had a full pass removing personal emails from every tracked file and from commit history itself; putting one back in a brand-new `SECURITY.md` would undo that. Confirmed via `gh api repos/midden-lab/ear-candy/private-vulnerability-reporting` (404) that this feature is **not currently enabled** on the repo — enabling it is a one-line, reversible repo-settings toggle (`PUT` to that same endpoint, or the checkbox under the repo's Settings → Security), not a code change.

**Non-blocker 2 — `plans/003`'s stale frontmatter:** once Step 1 below actually implements PRIV-1, `plans/003` is genuinely complete for the first time. Its frontmatter already happens to say `status: complete, steps_completed: 9` (incorrectly, ahead of the actual work) — Step 6 below corrects the body's now-stale "Status (2026-08-30): not yet implemented" note so a future reader isn't misled the same way this audit was.

**Files involved:** `server/src/app.ts`, `server/tests/helpers.ts`, a new server test file, `server/package.json`/`server/package-lock.json`, `SECURITY.md` (new), `plans/003-red-team-remediation.md`.

**Existing test-infra gap to know about before Step 2:** `server/tests/helpers.ts`'s `buildTestApp()` always passes `logger: false` — every one of the ~265 existing server tests runs with logging fully disabled, so there is currently no way to assert anything about log *output* using the shared helper. Step 2 adds a second, separate helper for exactly this purpose rather than changing `buildTestApp()` itself, so none of the existing 265 tests are put at risk.

## Steps

### Step 1: Disable Fastify's automatic request logging (PRIV-1)

**Files:** `server/src/app.ts`

**Requires review:** true — logging-behavior change with a real privacy implication, matching `plans/003`'s own review-gate reasoning for this exact step.

Change:
```ts
const app = Fastify({ logger: opts.logger ?? true, trustProxy: resolveTrustedProxies(process.env.TRUSTED_PROXY_IPS) })
```
to:
```ts
// Fastify's *automatic* per-request pino lines ("incoming request" /
// "request completed") include req.remoteAddress for every request,
// including public analytics endpoint hits — persisted to disk via
// Docker's json-file log driver in production, contradicting geoip.ts's
// resolveCountry() doc comment that the client IP is "resolved then
// discarded, never persisted." disableRequestLogging only turns off
// these automatic lines; it does NOT touch req.log itself, so the
// deliberate, intentionally-scoped forensic logging in
// routes/admin/auth.ts (admin_login/admin_logout events, which include
// ip on purpose) is completely unaffected (PRIV-1).
const app = Fastify({
  logger: opts.logger ?? true,
  disableRequestLogging: true,
  trustProxy: resolveTrustedProxies(process.env.TRUSTED_PROXY_IPS)
})
```
Before finishing this step, grep the codebase for anything that might rely on Fastify's automatic request-log fields (test assertions, ops tooling, log-parsing scripts) — none are expected (confirmed no existing test currently asserts on logger output at all, per Context), but if anything turns up, stop and surface it rather than proceeding silently.

**Acceptance criteria:**
- [ ] `buildApp()` passes `disableRequestLogging: true` to `Fastify(...)`, with the explanatory comment above.
- [ ] Grep confirms nothing else in the codebase depends on the automatic request-log lines.
- [ ] `make test` (server) still passes unchanged (no existing test should break, since none currently assert on logger output).

---

### Step 2: Add log-capture test infrastructure and verify the fix

**Files:** `server/tests/helpers.ts`, new `server/tests/request-logging.test.ts`

**Requires review:** false

Add a second helper to `server/tests/helpers.ts`, alongside the existing `buildTestApp()` (don't modify that one):
```ts
import pino from 'pino'

/** Like buildTestApp(), but with a real, capturable pino logger instead of
 *  logger:false — for tests that need to assert on what does or doesn't
 *  get logged (e.g. PRIV-1's disableRequestLogging verification). Returns
 *  both the app and the array of parsed JSON log lines it will have
 *  written to by the time a test inspects it. */
export function buildTestAppWithLogCapture() {
  const lines: Record<string, unknown>[] = []
  const stream = {
    write(chunk: string) {
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue
        lines.push(JSON.parse(line))
      }
    },
  }
  const logger = pino(stream)
  const app = buildApp({ dbPath: ':memory:', logger })
  return { app, logs: lines }
}
```
(Adjust the exact `pino`/stream wiring as needed to match how `buildApp`'s `opts.logger` type accepts a pre-built logger instance vs. options object — check `AppOptions`'s `logger` field type in `app.ts` and Fastify's own typing for what `logger` accepts; the goal is simply "a real pino logger writing to a stream this test can inspect," however it's wired.)

New test file `server/tests/request-logging.test.ts`:
- A plain `GET /api/health` produces **no** log line matching the automatic request-log shape (Fastify's default lines carry a `req` object with `remoteAddress`, or a message like `"incoming request"`/`"request completed"` — assert none of the captured `logs` entries contain a `req.remoteAddress` field or one of those default messages).
- A failed admin login (`POST /api/admin/login` with a wrong password, `ADMIN_PASSWORD_HASH` set per the existing `admin-auth.test.ts` pattern) still produces a captured log line with `event: 'admin_login', outcome: 'failure', ip: <something>` — the deliberate logging is unaffected.
- A successful login followed by logout produces the corresponding `admin_login`/`outcome: 'success'` and `admin_logout` lines, each with `ip`.

**Acceptance criteria:**
- [ ] `buildTestAppWithLogCapture()` exists in `server/tests/helpers.ts`, doesn't alter `buildTestApp()`'s behavior or signature.
- [ ] New test file confirms no automatic request-log line appears for a plain request.
- [ ] New test file confirms the three deliberate `admin_login`(×2 outcomes)/`admin_logout` log lines still appear with `ip` populated.
- [ ] `make test` (server) passes, all ~265 pre-existing tests unaffected.

---

### Step 3: Patch the two vulnerable dependencies

**Files:** `server/package.json` (only if a version-range change turns out to be needed — expected not to be), `server/package-lock.json`

**Requires review:** true — addresses two real CVEs including one (fastify's X-Forwarded-For spoofing) that touches a security-relevant mechanism this app depends on (`trustProxy`); worth a deliberate look at the resulting `npm audit` output before moving on, not a blind bump.

Both patched versions are already inside the currently-declared `package.json` ranges (confirmed via `npm view fastify versions` / `npm view sharp versions` — see Context) — this should be achievable via `npm update fastify sharp` inside `server/`, regenerating `package-lock.json` without touching `package.json`. If `npm update` doesn't move the installed version far enough for any reason, fall back to explicit `npm install fastify@5.12.4 sharp@0.35.4` (still within the existing `^5.10.0`/`^0.35.3` ranges — this should not change anything in `package.json`'s dependency line, only the lockfile's resolved version).

After updating:
- Run `npm audit` in `server/` and confirm both advisories are gone (zero vulnerabilities, or only advisories unrelated to these two packages if something new happens to appear from npm's registry between now and execution — if so, note it, don't silently absorb scope creep into this step).
- Run the full server test suite, paying particular attention to `server/tests/admin-upload-image.test.ts` and `server/tests/admin-upload-favicon.test.ts` (the `sharp`-dependent tests) — a patch-level bump shouldn't change behavior, but confirm rather than assume, since `sharp` processes binary image data where even small library changes can occasionally shift output.

**Acceptance criteria:**
- [ ] `npm view fastify version` inside `server/node_modules/fastify` (or `node -e "console.log(require('./node_modules/fastify/package.json').version)"` from `server/`) reports `5.12.4` or later, still `5.x`.
- [ ] Same check for `sharp` reports `0.35.4` or later, still `0.35.x`.
- [ ] `server/package.json`'s declared ranges (`^5.10.0`, `^0.35.3`) are unchanged, confirming this was a lockfile-only fix.
- [ ] `npm audit` (server, production deps) reports zero vulnerabilities for `fastify`/`sharp`.
- [ ] `make test` (server) passes, including both sharp-dependent upload test files.

---

### Step 4: Add SECURITY.md and enable GitHub Private Vulnerability Reporting

**Files:** `SECURITY.md` (new)

**Requires review:** false

Create `SECURITY.md` at the repo root:
```markdown
# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities privately using
[GitHub's private vulnerability reporting](https://github.com/midden-lab/ear-candy/security/advisories/new)
feature, rather than opening a public issue.

You should receive an initial response within a reasonable time. This is a
small, single-maintainer project — please be patient, and thank you for
helping keep it and its self-hosted deployments safe.

## Supported Versions

This project does not currently maintain multiple released versions —
security fixes are applied to the latest commit on `main` only. If you're
running an older deployment, update to the latest release.
```
Enable the feature itself on the repo (a settings toggle, not a code change):
```bash
gh api --method PUT repos/midden-lab/ear-candy/private-vulnerability-reporting
```
Confirm it took effect (should now return 204/success rather than the current 404):
```bash
gh api repos/midden-lab/ear-candy/private-vulnerability-reporting -i
```

**Acceptance criteria:**
- [ ] `SECURITY.md` exists at the repo root with working links (repo owner/name match `midden-lab/ear-candy`).
- [ ] `gh api repos/midden-lab/ear-candy/private-vulnerability-reporting` no longer 404s (feature confirmed enabled).
- [ ] No email address of any kind appears in the file.

---

### Step 5: Full quality gate

**Files:** none (verification only)

**Requires review:** false

Run `make test`, `make lint`, and (from `client/`) `npx tsc --noEmit`. Also re-run `npm audit` in both `server/` and `client/` as a final confirmation.

**Acceptance criteria:**
- [ ] `make test` fully green (server + client — server test count should be ~268, up from 265: 3 new tests from Step 2, 0 from Steps 1/3/4).
- [ ] `make lint` clean.
- [ ] `tsc --noEmit` clean.
- [ ] `npm audit` clean (or only pre-existing, unrelated, not-yet-fixable advisories if any newly appear) in both packages.

---

### Step 6: Correct `plans/003`'s stale status

**Files:** `plans/003-red-team-remediation.md`

**Requires review:** false

Only do this after Steps 1-2 are confirmed working (PRIV-1 genuinely implemented and tested) — this step is purely bringing the document in line with reality, not doing the work itself. Replace the Step 5 status line:
```
**Status (2026-08-30):** not yet implemented. Steps 6-9 were completed and merged to `dev` out of order, ...
```
with a note that it was implemented via `plans/017` (this plan) on today's date, and that the plan is now genuinely fully complete (1-9). Leave every other word of Step 5's own instructions/acceptance-criteria text untouched — this is a status-note correction, not a rewrite of the step's content. The frontmatter (`status: complete, steps_completed: 9`) needs no change — it was already (prematurely, but now truthfully) correct.

**Acceptance criteria:**
- [ ] `plans/003`'s Step 5 status note accurately reflects that the fix is now implemented, with a reference to this plan.
- [ ] No other content in `plans/003` is altered.

## Testing

Steps 1-3 are server-only and get direct new/extended Vitest coverage (Step 2's new `request-logging.test.ts`, Step 3's re-run of the two sharp-dependent upload test files). Steps 4 and 6 are documentation/repo-settings changes with no automated test — Step 4's acceptance criteria include a direct `gh api` check as its own verification. No client-side or e2e changes anywhere in this plan.

## Notes

- **Why lockfile-only dependency bumps, not explicit `package.json` version-range bumps:** both patched versions are already inside the currently-declared semver ranges (`^5.10.0` allows `5.12.4`; `^0.35.3` allows `0.35.4`) — the vulnerability exists only because the lockfile pinned an old resolution within that already-permissive range, not because the range itself excludes the fix. Bumping `package.json`'s ranges isn't needed and would be scope creep beyond what fixing these two CVEs actually requires.
- **Why Step 6 comes last:** correcting `plans/003`'s status before Steps 1-2 are verified working would reintroduce exactly the same problem this plan exists to fix — a plan document claiming something is done before it demonstrably is.
