---
id: security-audit-remediation
title: "Security Audit 2026-11 — Prioritized Findings & Zero-Regression Remediation"
status: in-progress
priority: 1
created: 2026-11-15
steps_completed: 1
steps_total: 11
tags: [security, hardening, red-team, deploy-safety, dependencies]
---

# Security Audit 2026-11 — Findings & Remediation

## Summary

A fresh adversarial review of the whole stack (server routes, auth, uploads, analytics, client sinks, Docker/CI/deploy, dependencies). Four suspected auth bugs were **reproduced with throwaway in-memory tests**; one of them (unauthenticated logout) lets any anonymous visitor log the admin out on demand. There are 0 Critical findings, 2 High, 5 Medium, and several Low. This plan fixes everything actionable in three independently-shippable phases, **front-loading production safety nets (pre-deploy DB backup, automatic rollback, data-snapshot diff) so no later phase can lose data or leave the site down.**

## Method and limits (read this)

- **This was a single-agent adversarial pass, not the multi-agent red team plan 003 used (five agents).** A parallel multi-agent pass (e.g. separate agents for auth, uploads/parsers, supply chain/CI, client, infra) can be run on request and may surface more. Nothing was run against production. Reproductions used `buildApp({dbPath: ':memory:'})` in a scratch copy of `server/` inside a pinned `node:22-alpine` container; no repo files were modified by the audit.
- Not covered: the live Droplet's OS/SSH/firewall config, the Caddy config as deployed, GitHub org settings/secrets, and third-party service accounts. Items needing a human on those are marked **MANUAL**.
- Already-tracked issues are not re-reported: #1/#3/#37 (off-site backups/restore), #5, #9, #10, #21/#41 (password change), #102 (retention — partly addressed in Step 9, opt-in only), #104.

## Findings, by priority

Legend — Verified: **R** = reproduced by test, **C** = confirmed by reading code, **A** = advisory-based (reachability analysed).

### HIGH

Both High findings affect only the **admin plane** (availability/integrity of admin access); neither exposes listener data or content.

| ID | Finding | Evidence | Fix step |
|----|---------|----------|----------|
| H1 | `POST /api/admin/logout` has no `requireAdmin`. Any anonymous caller bumps `settings.session_epoch`, revoking every admin session. Repeatable forever → admin cannot stay logged in (availability/integrity of the admin plane). | **R**: anon logout → admin cookie then returns 401. `server/src/routes/admin/auth.ts` | 4 |
| H2 | Global login lockout (30 failures / 30 min, any IP) hard-blocks **correct-password** logins too. Three IPs × 10 guesses locks the real admin out for 30 min, repeatable. Combined with H1 the attacker fully controls admin access. | **R**: correct password → 429 after 31 failures from 31 distinct IPs. `auth.ts` `GLOBAL_MAX_FAILED_ATTEMPTS` | 6 |

### MEDIUM

| ID | Finding | Evidence | Fix step |
|----|---------|----------|----------|
| M1 | `PUT /api/admin/settings` does `DELETE FROM settings` + `INSERT` without `session_epoch`, and not in a transaction. Epoch resets to 0 → **previously revoked cookies become valid again** (until their 24h expiry) and the admin's own cookie dies. A crash between the two statements leaves zero settings rows → public `/api/settings` returns 500 (site down). The shipped UI only uses PATCH, so this is latent, not live. | **R**: epoch 1 → 0 after PUT; old cookie → 200. `server/src/routes/admin/settings.ts` | 5 |
| M2 | Dependency advisories (`npm audit --omit=dev`, server: 9, client: 0): `@fastify/busboy` (multipart DoS, CRLF filename), `sharp <0.35.5` (librsvg), `music-metadata ≤11.15` (EBML memory exhaustion; uncatchable crash on crafted `.dsf`), `fastify ≤5.12.5` (header-validation bypass), `fast-uri`, `@fastify/static`, `brace-expansion`/`glob`/`minimatch`. **Reachability: all multipart/sharp/music-metadata paths are admin-only** (`req.file()` is only called after `requireAdmin`), so exploitation needs the admin session; `fast-uri`/`brace-expansion` are build/schema-time. Still: a process-abort bug means one crafted upload crashes the container. | **A** (`npm audit`) | 3 |
| M3 | **(admin-only)** Image upload trusts extension/mimetype, then `sharp(buffer)` decodes by **content**. A file named `x.png` that is really an SVG/other format reaches libsharp's SVG (librsvg) decoder — the code path M2's sharp advisory is about. 15 MB cap only. | **C**: `upload-image.ts` has no magic-byte check (audio/favicon do) | 8 |
| M4 | Unauthenticated endpoints return **500 with raw error text** on malformed bodies (`POST /admin/login` with no/non-string `password`). Authenticated admin routes also 500 on missing fields (`POST /admin/seasons` without `title`) and accept wrong types (`number: "x"` → 201). No central error handler, so internals can leak and noise buries real errors. | **R** (login ×4 → 500; season ×1 → 500, season-with-string-number → 201) | 6, 7 |
| M5 | Public analytics write endpoint: 120/min **per IP** but no global cap and no retention (#102). A distributed flood grows `events` without bound on the same volume as the DB and uploads → disk-full → site and DB down. | **C**: `routes/analytics.ts`, `db/migrate.ts` | 9 |
| M6 | Production container runs with Docker's default capability set and without `no-new-privileges`. Runs non-root already (good), but RCE in a dependency would keep default caps. No automatic rollback: `deploy` stops/removes the old container **before** the new one is proven healthy, so a bad image = downtime until a human intervenes; no DB snapshot is taken at deploy time. | **C**: `.github/workflows/ci-cd.yml` deploy script | 2, 10 |

### LOW

| ID | Finding | Fix step |
|----|---------|----------|
| L1 | `accent_color` is any string server-side (verified **R**: `red;}body{x` → 200). Written via `style.setProperty` so it can't break out of the declaration — cosmetic/robustness only. Add `#rrggbb` validation on write. | 7 |
| L2 | `PUBLIC_ORIGIN` isn't passed by the `deploy` `docker run` (same class as #106/gotcha 37b), so `og:url`/`og:image` fall back to the request `Host`. Mitigated by Caddy only routing the configured domain. | 10 |
| L3 | No HSTS anywhere: the app disables it by design, and `infra/Caddyfile.template` doesn't add it. **MANUAL** to apply on the Droplet. | 11 |
| L4 | **(admin-only)** Upload failure/abort leaves a partial file in `data/uploads` (publicly addressable by its UUID name, unreferenced). Disk growth only. | 8 |
| L5 | Password handling: bcrypt cost is 12 in `scripts/hash-password.sh` but 10 in the `Makefile`'s `setup`; no minimum-length guidance. Docs-only. | 11 |
| L6 | `backup.sh` (created by `scripts/setup-droplet.sh`) calls `sqlite3`, which the setup script never installs. If missing, nightly backups silently fail under cron. **MANUAL check** on the Droplet. | 1 |

| L7 | `make setup` echoes the plaintext `PASSWORD` to the terminal and passes it as a process argument (`Makefile`, `scripts/hash-password.sh`), and bind-mounts the real `server/` while running `npm ci` in a Linux container (replaces host `node_modules` with Linux binaries — a plausible cause of local-toolchain breakage). Dev-only. | 11 |

### ACCEPTED / NOT FIXING (documented, not hidden)

- Hidden episodes' audio files are reachable if someone knows the UUID filename (API filters hide the *listing*, static serving doesn't). UUIDv4 is unguessable; documented in CLAUDE.md in Step 11.
- Login lockout state is in-memory and resets on deploy/restart. Acceptable for single-admin.
- No in-app password change (#21/#41). CSRF is covered by `SameSite=strict` + JSON/multipart-only APIs. XSS sinks checked by grep: no `dangerouslySetInnerHTML`/`innerHTML` in the client, `ShareDialog` links use `rel="noopener noreferrer"`, OG HTML is escaped. Only the first part of `admin/analytics.ts` (parameterised queries, hardcoded column literals) was read in full; the rest and the client components were not line-by-line reviewed.
- CSP `img-src https:` / `media-src https:` are intentionally broad because episodes may use external URLs.

## No-regression strategy (the contract this plan must honor)

1. **No schema changes, no migrations, no data deletion by default.** Every step is code/config only. Step 9's retention is opt-in and **off unless the maintainer sets `EVENTS_RETENTION_DAYS`**; unset or empty = never delete.
2. **Three phases, three separate promotion PRs, strictly sequential.** Do not open Phase N+1's promotion PR until Phase N's deploy is merged, green on `verify-production`, and its post-deploy diff (Step 1's tool) is clean.
3. **Safety nets ship first (Phase A)**: pre-deploy backup, automatic rollback to the previously-running image digest, and a before/after data snapshot tool. Everything after is protected by them.
4. Every behaviour change starts with a **failing test**, then the fix.
5. Data-bearing counts that must be **identical before vs. after** any deploy: `seasons`, `episodes`, `settings` row count (must equal 1), `settings.session_epoch` (may only increase via real logouts), `schema_migrations` max version, number of files under `data/uploads` (+ `images`). `events` may only grow (or shrink only if retention was deliberately enabled).

## Context

- Branching (CLAUDE.md "Branching & Workflow"): work on branches off `dev`; PR → `dev`; `dev`→`main` promotion is a **squash-merge by the maintainer, by hand**. Merging to `main` deploys to production. **The agent never pushes to `main` and never merges a promotion PR.** After a squash merge, resync `dev` per CLAUDE.md.
- CI: pushes to `dev` skip `e2e` (only lint/test/typecheck/build run). The `e2e` job runs only on PRs targeting `main` or on `main`. Therefore **run `make e2e` locally before opening any promotion PR** (this runs `make e2e-reset-db` first; see `e2e/CLAUDE.md`). Use `make` targets, not raw npm/docker (CLAUDE.md "Essential Commands").
- **Local toolchain problem found during the audit:** the host's Homebrew Node fails to start (`dyld: Library not loaded: .../libsimdutf.37.dylib`). The maintainer should fix it before Step 3 with `brew reinstall simdutf node` (agents must not run this), then confirm `node -v`. If it can't be fixed, fall back to running server tests in the pinned container:
  `docker run --rm -v "$PWD/<copy-of-server>:/w" -w /w node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 sh -c 'apk add --no-cache python3 make g++ && npm ci && npx vitest run'` (copy `server/` without `node_modules`/`data` into a temp dir first, so Linux-built native modules never overwrite the macOS ones; never bind-mount the real `server/` with `npm ci`).
- Patterns to mirror: Fastify plugin route files in `server/src/routes/`; tests use `buildTestApp()` + `app.inject()` (`server/tests/helpers.ts`); admin auth tests set `process.env.ADMIN_PASSWORD_HASH` to a bcrypt hash and delete it in `afterEach`; hand-rolled validation (no schema library) as in `routes/analytics.ts`.
- Env vars needed by production must be added to the `deploy` job's `docker run` (CLAUDE.md gotcha 37b) — Steps 9 and 10 do this.
- Files most involved: `.github/workflows/ci-cd.yml`, `server/src/app.ts`, `server/src/server.ts`, `server/src/auth.ts`, `server/src/routes/admin/{auth,settings,seasons,episodes,upload-image,upload,upload-favicon}.ts`, `server/src/routes/analytics.ts`, `server/package.json`+lockfile, `infra/Caddyfile.template`, `docker-compose.prod.yml`, `CLAUDE.md`, `docs/runbooks/`.

## Goal protocol (for semi-autonomous / `/goal`-style execution)

There is no installed skill named "goal" (checked `~/.claude/skills` and `.claude/skills`); this plan is written so a loop or `/goal` runner can drive it with a verifiable stop condition.

- **Preconditions:** `git status` is clean for every file this plan touches. At plan-creation time `CLAUDE.md` had uncommitted maintainer edits, plus untracked `.claude/`, `client/CLAUDE.md`, `e2e/CLAUDE.md`, `plans/016-*.md` — **stop and ask the maintainer to commit or stash those before the first step**, so per-step commits never sweep in unrelated work. The host Node fix (`brew reinstall`) is a **manual prerequisite**; the agent must not reinstall system packages.
- **Unit of work = one phase.** Run: `plan-executor` on this file, execute steps of the current phase in order, commit per step on a branch off `dev`.
- **Phase finish condition (all must be true, then STOP and report):**
  1. All steps in the phase are checked `[x]` and `steps_completed` in this file's frontmatter is updated.
  2. `make lint` and `make test` exit 0 (or the pinned-container equivalent from Context, if the host Node is still broken); `make e2e` exits 0 (with a fresh `make e2e-reset-db`). Note this e2e uses the dev stack, **not** the production image — it does not cover Alpine native rebuilds or container flags, so also require item 4's PR checks.
  3. The phase's branch is merged into `dev` via PR and the `dev` CI run is green (`gh run list --branch dev --limit 1`, conclusion `success`).
  4. A `dev`→`main` promotion PR is **open** (not merged) whose description lists the phase's steps and links the Step 1 checklist, **and every check on that PR is green** (`gh pr checks <n>` shows no failing/pending job, including CI's production-image `e2e`). `gh pr list --base main --head dev --state open` returns it.
- **Never autonomous:** merging to `main`, running anything on the Droplet, `gh secret`/`gh variable` changes, enabling retention. These are the **MANUAL** gates below.
- **Stop-and-ask triggers:** any acceptance criterion that can't be met; any e2e failure not reproduced on a clean `dev`; any change that would need a DB migration; a test that passes only after being weakened.

## MANUAL gates (human, on the Droplet / GitHub) — never run by the agent

- **Before each promotion merge:** `ssh` to the Droplet and run `/opt/ear-candy/backup.sh`; confirm `command -v sqlite3` succeeds (L6) and a fresh `db_*.sqlite` + `uploads_*.tar.gz` exist in `/opt/ear-candy/backups/`; run `scripts/prod-data-snapshot.sh` (Step 1) and keep its output.
- **After each deploy:** `verify-production` job green; run `scripts/prod-data-snapshot.sh --compare <saved-file>`; load the public site, play one episode, log into admin, open Settings and Analytics.
- Pull the backup off-host (#1/#37) at least once before Phase C.

## Steps

---
# PHASE A — Production safety nets (ship first; low app risk)
---

### Step 1: Add a data-snapshot/compare tool and the rollout checklist runbook

**Files:** `scripts/prod-data-snapshot.sh` (new), `docs/runbooks/security-rollout.md` (new)
**Requires review:** false

Create `scripts/prod-data-snapshot.sh`, run **on the Droplet** (bash, `set -euo pipefail`). Usage: `prod-data-snapshot.sh` (writes and prints a snapshot) and `prod-data-snapshot.sh --compare <file>` (takes a new snapshot and diffs against `<file>`, exit 1 on any forbidden difference). It is **strictly read-only**: use `sqlite3 -readonly /opt/ear-candy/data/db.sqlite` only (never write, never `.backup`), and `find ... | wc -l` for files. Snapshot lines (stable `key=value` format):
```
ts=<ISO8601>
seasons=<count>
episodes=<count>
episodes_hidden=<count>
settings_rows=<count>
session_epoch=<int>
schema_max=<int from schema_migrations>
events=<count>
uploads_audio_files=<count of regular files directly in data/uploads, excluding images/>
uploads_image_files=<count in data/uploads/images>
accent_color=<value>
max_episode_title_len=<max(length(title))>
max_episode_text_len=<max over description, guests, tags of length()>
max_season_title_len=<max(length(title))>
max_season_number=<max(number)>
max_episode_number=<max(number)>
```
`--compare` rules: `seasons`, `episodes`, `episodes_hidden`, `settings_rows` (must be `1`), `schema_max`, `uploads_*`, `accent_color` must be **equal**; the `max_*` keys are informational in `--compare` (they feed Step 7's gate); `session_epoch` must be `>=`; `events` must be `>=` (print a warning, not a failure, if smaller **and** the operator passes `--allow-events-shrink`). Print `OK`/`DIFF` per line. Also print `sqlite3`-missing as a clear error (exit 2).

Create `docs/runbooks/security-rollout.md`: the MANUAL gates above as a numbered checklist (pre-merge, post-deploy, rollback), plus how to restore from a `pre-deploy_*` backup (stop container, replace `db.sqlite`, delete `-wal`/`-shm`, restart; reference CLAUDE.md gotcha 5) and how to hand-roll back to the previous image digest if Step 2's auto-rollback itself fails.

**Acceptance criteria:**
- [x] `bash -n scripts/prod-data-snapshot.sh` passes; `shellcheck` clean if available.
- [x] Run against a temp SQLite file created in the scratchpad (with the same table names), the snapshot prints all keys, and `--compare` exits 0 on identical input and 1 when `episodes` differs.
- [x] The script contains no `INSERT|UPDATE|DELETE|DROP|\.backup` and opens SQLite with `-readonly`.
- [x] Runbook contains the rollback and restore procedures and mentions `/opt/ear-candy/backup.sh`.

---

### Step 2: Make `deploy` take a backup first and roll back automatically on failure

**Files:** `.github/workflows/ci-cd.yml`
**Requires review:** true (deploy path; this step is exercised for the first time by the deploy it ships in — hence it ships alone)

Edit only the `deploy` job's remote script (keep every existing `${{ }}`-via-`env:`/`envs:` convention, SHA pins and quoting rules; bcrypt hash stays single-quoted semantics, i.e. only referenced as `"$DEPLOY_ADMIN_PASSWORD_HASH"`):

1. Before `docker stop`, capture the running image reference: `PREV_IMAGE=$(docker inspect --format '{{.Config.Image}}' ear-candy 2>/dev/null || true)`.
2. After `docker stop`/`docker rm` (so the SQLite files are cleanly closed and a plain copy is consistent) and **before** `chown`/`docker run`, copy exactly `/opt/ear-candy/data/db.sqlite`, `db.sqlite-wal` and `db.sqlite-shm` (each only if it exists; **never a `db.sqlite*` glob**, which would also copy every accumulated `.pre-migration-*.bak`) into `/opt/ear-candy/backups/pre-deploy_<UTC-timestamp>/` with `cp -a`. Name the files `db.sqlite` etc. **without** a `.sqlite` suffix change that the existing `backup.sh` rule `find $BACKUP_DIR -name '*.sqlite' -mtime +14 -delete` would match — it recurses, so it would silently delete the copy inside old `pre-deploy_*` directories; either keep that rule's effect acceptable (14 days) and document it, or write the copy as `db.sqlite.predeploy` and say so in the runbook. If the copy fails, **abort the deploy and restart the previous container** (see 4) — do not proceed. Keep only the newest 5 `pre-deploy_*` directories (`ls -dt ... | tail -n +6 | xargs -r rm -rf`, scoped strictly to that glob under `/opt/ear-candy/backups/`; this only prunes backups this step created). No `sqlite3` dependency.
3. Refactor the existing `docker run` into a shell function `run_app() { docker run -d ...same flags... "$1"; }` with **identical flags** to today's (do not add hardening flags here; that's Step 10). Call `run_app "$IMAGE"`. **Move the existing `docker image prune -f` to run only after the health check succeeds** (today it runs right after `docker run`, which can delete the just-replaced previous image — the one rollback needs).
4. On health-check failure (the existing 30×2s loop): if `PREV_IMAGE` is non-empty, `docker rm -f ear-candy`, `run_app "$PREV_IMAGE"`, wait for health, print `ROLLED BACK to $PREV_IMAGE` and **still `exit 1`** so the job and `verify-production` stay red. If no `PREV_IMAGE`, just fail as today.

Leave the `verify-production` job unchanged.

**Acceptance criteria:**
- [ ] `docker run` flags in `run_app` are byte-for-byte equivalent to the current ones (diff reviewed).
- [ ] The extracted remote script passes `bash -n` and, if `shellcheck` is available, has no new warnings.
- [ ] A local harness (shell script in the scratchpad, **not committed**) that puts stub `docker`/`curl` binaries first on `PATH` demonstrates: (a) healthy path starts only the new image; (b) when the stub health check fails, `docker run` is invoked a second time with `PREV_IMAGE` and the script exits non-zero; (c) when the `cp` backup fails, the new image is never started.
- [ ] `docker image prune -f` occurs only after the health loop succeeds (rollback image can't be pruned first).
- [ ] The backup copies only the three named files (no glob) and survives `backup.sh`'s 14-day sweep or is documented as subject to it.
- [ ] Workflow still has no `${{ }}` spliced into `run:`/`script:` text (grep check).
- [ ] CLAUDE.md "CI/CD" section updated to describe pre-deploy backup + auto-rollback.

---
# PHASE B — Dependency patches (ship alone; isolates native-module risk)
---

### Step 3: Patch server dependency advisories without major bumps

**Files:** `server/package.json`, `server/package-lock.json`
**Requires review:** true (native modules; upload pipeline)

Confirm the Node toolchain works first (a manual prerequisite, see Context; or use the pinned-container equivalent). In `server/`, run `npm audit fix` (no `--force`). If a fix requires a **major** bump, do not apply it: leave that package, record it in this plan's Notes, and keep the remaining fixes. Do not touch `client/` (0 advisories). Never run `npm audit fix` in the repo root or with Docker bind-mounted over the real `server/` (CLAUDE.md phantom-mount warning).

Gate (all required): `make lint`, `make test`, `server/tests/audio-range.test.ts` explicitly (CLAUDE.md gotcha 17a: static-plugin bumps must re-run it), `make e2e` (uses real audio decode, image upload, favicon upload). Also `docker build .` of the production Dockerfile must succeed (native `bcrypt`/`better-sqlite3`/`sharp` rebuild on Alpine).

**Acceptance criteria:**
- [ ] `cd server && npm audit --omit=dev` reports 0 high/critical; any remaining moderate is listed in Notes with its reason.
- [ ] `git diff --stat` shows only `server/package.json` and `server/package-lock.json` changed (plus Notes in this plan).
- [ ] `make test`, `make lint`, `make e2e`, and `docker build .` all succeed.
- [ ] Duration auto-detection and the upload e2e tests pass unchanged.

---
# PHASE C — Code, config and docs fixes
---

### Step 4: Require authentication for `POST /admin/logout` (H1)

**Files:** `server/src/routes/admin/auth.ts`, `server/tests/admin-auth.test.ts`
**Requires review:** true (auth)

Test first: add cases to `admin-auth.test.ts`: (a) anonymous `POST /api/admin/logout` → **401** and `settings.session_epoch` unchanged; (b) authenticated logout → 200, epoch +1, the same cookie then 401 on `/api/admin/session`; (c) a request with a forged/invalid cookie → 401, epoch unchanged. Then add `{ preHandler: requireAdmin }` to the logout route. The 401 path needs no cookie clearing (the browser cookie is useless once rejected). Check `client/src/api.ts` (`adminLogout`, ~line 74) and `AdminLayout`: the client must clear its local state and return to the listener view even if logout returns 401 (an already-expired session); fix it only if it currently depends on a 2xx, and add a client test.

**Acceptance criteria:**
- [ ] Anonymous logout returns 401 and does not change `session_epoch` (test).
- [ ] Authenticated logout still revokes all sessions (test; existing #34 tests pass).
- [ ] Client logging out with an expired session still ends up logged-out in the UI (test).
- [ ] e2e logout flow passes.

---

### Step 5: Make `PUT /admin/settings` preserve the row and `session_epoch` (M1)

**Files:** `server/src/routes/admin/settings.ts`, `server/tests/admin-settings.test.ts` (or the existing settings test file), `CLAUDE.md` (gotcha 8)
**Requires review:** true

Test first: (a) logout twice (epoch 2), PUT settings → `session_epoch` still 2 and a pre-PUT cookie from epoch 0 stays 401; (b) settings row count is exactly 1 after PUT; (c) all PUT-able fields are replaced, including setting nullable fields back to null/default; (d) simulated failure mid-PUT (invalid `cover_art_path`) leaves the original row intact. Implementation: replace `DELETE`+`INSERT` with a single `UPDATE settings SET <all PUT-able columns> = ?` inside `app.db.transaction(...)`; never touch `session_epoch`. Update CLAUDE.md gotcha 8 (the DELETE+INSERT pattern note is no longer true).

**Acceptance criteria:**
- [ ] `session_epoch` unchanged across a PUT (test).
- [ ] Settings row count is 1 after any PUT, including a rejected one (test).
- [ ] Response body shape unchanged vs. today (existing tests pass untouched).
- [ ] CLAUDE.md gotcha 8 reflects the new behavior.

---

### Step 6: Harden login input handling and replace the global hard lockout (H2, M4)

**Files:** `server/src/routes/admin/auth.ts`, `server/tests/admin-auth.test.ts`
**Requires review:** true (auth)

Test first (these are the reproduced behaviors): missing body / `{}` / `{password: 123}` / `{password: ['a']}` / empty string → **400** `{error:'password is required'}` (never 500), counted as a failed attempt against the per-IP counter only; 31 failures from 31 distinct IPs must **not** block a subsequent correct-password login from a fresh IP (→ 200); a single IP is still locked after 10 failures (→ 429, existing test stays); a `warn`-level log `{event:'admin_login_global_failure_spike', count}` fires once per window when the global count reaches the old threshold. Implementation: keep the per-IP lockout untouched; keep the global *counter* but make it **observability-only** (structured warn log, no 429). Never log the password. Rationale in code comment: a global hard block is itself a denial-of-service on the only admin credential; brute-force resistance rests on bcrypt cost + per-IP lockout + a strong password. In CLAUDE.md gotcha 10a/9 note the change.

**Acceptance criteria:**
- [ ] The four malformed bodies return 400, not 500 (test).
- [ ] Correct password succeeds after 31 distinct-IP failures (test).
- [ ] Per-IP lockout after 10 failures still returns 429 (existing test).
- [ ] The spike log line is emitted once per window and contains no password (log-capture test via `buildTestAppWithLogCapture`).

---

### Step 7: Add input validation helpers, a central error handler, and `accent_color` validation (M4, L1)

**Files:** `server/src/utils/validation.ts`, `server/src/app.ts`, `server/src/routes/admin/{seasons,episodes,settings}.ts`, matching tests in `server/tests/`
**Requires review:** false

Add to `utils/validation.ts`: `isNonEmptyString(v, max): v is string`, `isIntegerInRange(v, min, max)`, `isHexColor(v): boolean` (`/^#[0-9a-fA-F]{6}$/`). Apply to admin write routes: `title` must be a non-empty string ≤ 300 chars; `description`/`guests`/`tags` strings ≤ 10 000; `number`, `season_id` integers (0..1 000 000); `publish_date` a string; `accent_color` hex on PUT and PATCH. **Compatibility guard:** before coding, read the client forms (`EpisodeFormPanel.tsx`, `SeasonFormPanel.tsx`, `AdminSettings.tsx`) and `e2e/` fixtures to confirm the exact payload types they send, and set limits that accept all of them; **Set each cap at no less than 2× the maximum value found in production** (`max_*` keys from Step 1's snapshot; a PUT resends stored fields, so a cap below existing data would make editing that row return 400) — if the snapshot isn't available, omit the length/range caps and keep only type checks; unknown extra fields stay tolerated (don't switch to strict-reject on PUT/POST, to avoid breaking any client). Return 400 with `{error: '<field> is invalid'}`. Add `app.setErrorHandler`: for errors with `statusCode < 500` pass through Fastify's message; for everything else log with `req.log.error({err})` and reply `500 {error: 'Internal server error'}` (no stack, no raw SQLite text). Public routes keep current behavior.

**Acceptance criteria:**
- [ ] `POST /admin/seasons` without `title` → 400 (was 500); `number: "x"` → 400 (was 201).
- [ ] `PATCH /admin/settings {accent_color:'red;}body{x'}` → 400; `#5a3ef5` → 200.
- [ ] Rate-limit 429, multipart 413 and malformed-JSON 400 responses keep their current status codes and body shapes (test each; the error handler only rewrites non-4xx).
- [ ] A forced internal error returns `{error:'Internal server error'}` with no stack/DB text (test via a route that throws).
- [ ] Every existing server test and the whole e2e suite pass unchanged.
- [ ] **Pre-merge manual check recorded in the PR:** the production `accent_color` from Step 1's snapshot matches `#rrggbb`; if it doesn't, stop and ask before shipping (otherwise saving Settings in prod would start returning 400).

---

### Step 8: Validate image magic bytes before `sharp` and clean up partial uploads (M3, L4)

**Files:** `server/src/utils/magicBytes.ts`, `server/src/routes/admin/upload-image.ts`, `server/src/routes/admin/upload.ts`, `server/src/routes/admin/upload-favicon.ts`, `server/tests/` (image + upload tests)
**Requires review:** true

Test first: a buffer with SVG/GIF/BMP/TIFF content named `x.png` (mimetype `image/png`) → 400 before `sharp` is invoked; real JPEG/PNG/WebP fixtures (`e2e/fixtures/test-cover.jpg` etc.) still succeed with the same `{thumb, detail}` shape; an audio upload whose stream errors mid-way leaves **no** file in `data/uploads`. Add `matchesImageSignature(head: Buffer, ext: string): boolean` (JPEG `FF D8 FF`; PNG `89 50 4E 47 0D 0A 1A 0A`; WebP `RIFF....WEBP`) next to the existing audio/favicon matchers and call it on `buffer.subarray(0, 12)` before `sharp`. Construct sharp with `{ limitInputPixels: 50_000_000 }` for the metadata and both resizes (leave `failOn` at its default, which is already the strictest, `'warning'`). In `upload.ts` and `upload-favicon.ts`, wrap `pipeline(...)` in try/catch that `fs.promises.unlink(dest)` (ignore ENOENT) then rethrows. **Do not** change duration detection or which audio extensions are allowed (webm uploads must keep working).

**Acceptance criteria:**
- [ ] Spoofed-extension SVG/GIF is rejected with 400 (test).
- [ ] Existing cover-art, favicon, audio-range and duration tests pass; e2e upload tests pass.
- [ ] Aborted/failed upload leaves no orphan file (test).
- [ ] A 4000×4000 JPEG (16 MP) still uploads successfully (test with generated image via sharp).

---

### Step 9: Cap analytics write volume globally and add opt-in retention (M5, partially #102)

**Files:** `server/src/routes/analytics.ts`, `server/src/server.ts`, `server/src/utils/retention.ts` (new), `server/tests/analytics.test.ts`, `server/tests/retention.test.ts` (new), `.env.example`, `README.md`, `.github/workflows/ci-cd.yml`
**Requires review:** true (the only step that can delete data — default **off**)

(a) Global insert cap: inside `analyticsRoute`, an in-memory counter per minute; once `GLOBAL_MAX_EVENTS_PER_MINUTE = 1200` inserts occurred in the current minute, further valid events return 204 without inserting and log one `warn` per minute (`{event:'analytics_global_cap'}`). The 204/400 contract is unchanged. Existing analytics tests must pass untouched.
(b) `utils/retention.ts`: `parseRetentionDays(v: string | undefined): number | null` — returns `null` for undefined, empty, non-integer, or `< 30`; and `pruneEvents(db, days, batch = 5000): number` which deletes `events` older than `days` days in batches (loop `DELETE FROM events WHERE id IN (SELECT id FROM events WHERE created_at < datetime('now', ?) LIMIT ?)`). In `server.ts` only (not `buildApp`, so tests and in-memory apps are untouched): if `parseRetentionDays(process.env.EVENTS_RETENTION_DAYS)` is non-null, run once at boot and then every 24 h (`setInterval(...).unref()`), logging the deleted count. **Unset/empty → no timer, no deletion.**
(c) Wiring (gotcha 37b): document in `.env.example`/README; add `DEPLOY_EVENTS_RETENTION_DAYS: ${{ vars.EVENTS_RETENTION_DAYS }}` to the deploy `env:` and `envs:` lists and `-e EVENTS_RETENTION_DAYS="$DEPLOY_EVENTS_RETENTION_DAYS"` to `run_app`. An unset GitHub variable renders as empty → disabled. Leave the variable **unset**; enabling is the maintainer's MANUAL decision.

**Acceptance criteria:**
- [ ] `parseRetentionDays` returns null for `undefined`, `''`, `'abc'`, `'7'`; returns 90 for `'90'` (test).
- [ ] `pruneEvents` deletes only rows older than the cutoff and keeps newer ones (test with seeded events; also verifies orphan-safe — no FK errors).
- [ ] With the env var unset, `server.ts` registers no interval (verified by reading the code path + a unit test of the decision function).
- [ ] Events above the global cap return 204 and are not inserted; the first 1200 in a minute are (test with a lowered cap via a module constant override).
- [ ] The `deploy` job passes the variable by the `env:`/`envs:` convention, no `${{ }}` in script text.

---

### Step 10: Harden the container runtime flags and pin `PUBLIC_ORIGIN` (M6, L2)

**Files:** `.github/workflows/ci-cd.yml`, `docker-compose.prod.yml`
**Requires review:** true (runtime config)

Add `--cap-drop ALL` and `--security-opt no-new-privileges:true` to `run_app` (Step 2) **and to the `e2e` job's `docker run`**, so the exact same flags are exercised by the full e2e suite (real uploads, real audio) before any deploy. Mirror as `cap_drop: [ALL]` and `security_opt: ["no-new-privileges:true"]` in `docker-compose.prod.yml`. Do **not** add `--read-only` or memory/pids limits (sharp/music-metadata memory use on ~55 MB uploads makes a safe limit unknowable here; recorded in Notes). Add `-e PUBLIC_ORIGIN="$DEPLOY_PUBLIC_ORIGIN"` fed from `${{ vars.PUBLIC_ORIGIN }}` via the same `env:`/`envs:` pattern; empty value is safe (`resolveConfiguredOrigin` returns null → current behavior). **MANUAL:** the maintainer sets the repo variable `PUBLIC_ORIGIN` (e.g. `https://<their-domain>`) when ready.

**Acceptance criteria:**
- [ ] The e2e job's container uses the same cap/no-new-privileges flags as production and the full e2e suite passes with them (CI run on the promotion PR).
- [ ] Container still writes to `/app/data` as uid 1000 and binds :3000 (health check passes in e2e).
- [ ] An empty `PUBLIC_ORIGIN` leaves OG behavior unchanged (existing crawler tests pass; add a test that `resolveConfiguredOrigin('')` is null if absent).
- [ ] No `${{ }}` spliced into script text.

---

### Step 11: Docs, HSTS template, and password-hardening notes (L3, L5, accepted risks)

**Files:** `infra/Caddyfile.template`, `docs/runbooks/caddy-tls.md`, `CLAUDE.md`, `SECURITY.md`, `Makefile`, `README.md`
**Requires review:** false

- `infra/Caddyfile.template`: add inside the site block `header Strict-Transport-Security "max-age=31536000"` (no `includeSubDomains`, no `preload`, so it's reversible within a year only for this host). The template is consumed only by `scripts/setup-droplet.sh`, so this changes **nothing in production** until applied. Document the **MANUAL** apply procedure in `docs/runbooks/caddy-tls.md`: edit `/etc/caddy/Caddyfile`, `caddy validate --config /etc/caddy/Caddyfile`, `systemctl reload caddy`, `curl -sI https://<domain> | grep -i strict`, and the warning that HSTS can't be quickly undone for browsers that cached it.
- `Makefile` `setup`: stop echoing the plaintext password (print only that a hash is being generated) and pass it via `-e PW` from the environment instead of an interpolated argument where possible; replace the `-v $(PWD)/server:/app` + `npm ci` pattern with a throwaway copy or an image without bind-mounting the real `server/` (so host `node_modules` is never replaced by Linux binaries).
- Align the bcrypt cost (`Makefile` setup 10 → 12 to match `scripts/hash-password.sh`); document a minimum recommended password length (≥ 16 chars) in README/runbook. Existing hashes keep working (cost is embedded in the hash).
- CLAUDE.md: record the new gotchas (logout requires auth; PUT preserves `session_epoch`; global login counter is observability-only; image magic-byte check; analytics global cap + `EVENTS_RETENTION_DAYS` opt-in; container flags; accepted risk: hidden-episode audio reachable by unguessable URL). Mark this plan complete and reference it from `SESSION_CONTEXT.md` ("Security hardening" bullet).
- SECURITY.md: add one line that fixes ship through the `dev`→`main` flow.

**Acceptance criteria:**
- [ ] `docs/runbooks/caddy-tls.md` has the manual apply + verify + warning steps.
- [ ] `make setup` still generates a working `.env` (hash verifies via an existing login test or manual `make setup`).
- [ ] CLAUDE.md gotchas match shipped behavior (no stale DELETE+INSERT or global-lockout text).
- [ ] No production-affecting file other than the template changed in this step.

## Testing

- **Unit/integration (`server/tests/`):** every behavior change in Steps 4–9 has a test written first and seen failing. Reproduction harness for H1/H2/M1/M4 is described above; the scratch reproduction in the audit (`anon logout`, `PUT resets epoch`, `login bad bodies`, `31 distinct-IP failures`, `season no title`) is the spec to encode as permanent regression tests.
- **Client (`client/src/tests/`):** Step 4's logout-with-expired-session test.
- **E2E (`make e2e`, always preceded by `make e2e-reset-db`):** must pass at the end of every phase; Step 10's flags are exercised by CI's `e2e` job on the promotion PR.
- **Deploy-script testing:** stub-binary harness (Step 2) since the real script can't run pre-merge.
- **Production verification:** Step 1's snapshot/compare, `verify-production`, and the manual smoke test.

## Rollback

- App/code regressions: automatic (Step 2) to the previously running image digest; manual path in `docs/runbooks/security-rollout.md`.
- Data: pre-deploy copy in `/opt/ear-candy/backups/pre-deploy_*`, plus nightly `backup.sh` output, plus `data/db.sqlite.pre-migration-*.bak` (not triggered here — no migrations).
- Git: each phase is one squash commit on `main`; `git revert` of that commit and a normal promotion restores prior behavior (no data dependency, since no schema changes).

## Notes

- Alternatives considered for H2: a global tarpit/queue (rejected: an attacker can fill any shared slot, recreating the DoS) and a CAPTCHA (rejected: no third-party services is a project constraint). Chosen: keep per-IP lockout + bcrypt cost + alerting, and rely on a strong password.
- `--read-only` and memory/pids limits were deliberately left out of Step 10 to avoid regressions on large uploads; revisit with real measurements.
- Retention (Step 9) is deliberately opt-in; if the maintainer later wants a default, that's a separate, explicit decision because it deletes existing analytics.
- Step 3: record here any advisories left unfixed because they need a major-version bump.
- The audit did not review: Droplet OS hardening (SSH config, fail2ban, unattended-upgrades, firewall), GitHub account security (2FA, deploy-key scope, `GHCR_PAT` scope), DNS/registrar. Worth a separate checklist.
