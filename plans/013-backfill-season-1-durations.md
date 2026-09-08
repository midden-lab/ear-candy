---
id: backfill-season-1-durations
title: "Backfill missing episode durations for Season 1 (production data repair)"
status: pending
priority: 1
created: 2026-09-08
steps_completed: 0
steps_total: 8
tags: [data-repair, production, backfill]
---

# Backfill Season 1 Episode Durations

## Summary

22 of Season 1's 25 production episodes have `duration_seconds = 0`, confirmed via direct read-only queries against the production database. Root cause (confirmed, not guessed): the admin-side client-only duration probe (`probeAudioDuration` in `EpisodeFormPanel.tsx`) has an 8-second timeout that's too short for the browser to reliably resolve duration on the large (~57-58MB) files uploaded in a single admin session on 2026-08-11/12 — the probe silently times out, resolves `0`, and upload-type episodes never re-probe unless the admin explicitly re-selects the audio file. This plan backfills the *existing* broken rows for Season 1 only, as a first, cautious, verifiable batch before touching the other affected seasons. It does **not** change the ongoing client-side detection mechanism (the 8s-timeout bug itself) — that's separate follow-up work, out of scope here by explicit decision (duration detection stays client-side).

## Context

**Confirmed production state** (read-only queries via SSH — `ssh earcandy`, alias already configured, `docker exec ear-candy node -e "..."` against `/app/data/db.sqlite` opened `{ readonly: true }`):
- Season 1 (`season_id = 69` in production) has 25 episodes. 3 (`id` 96, 97, 98 — the July 2026 batch) already have correct durations. 22 (`id` 101-122, the Aug 11-12 batch) have `duration_seconds = 0`.
- All 25 are `audio_type = 'upload'`, with real files already present on disk at `/app/data/uploads/<uuid>.mp3` (confirmed via directory listing for a sample).
- Playback (which reads live from the `<audio>` element, not the stored column) already shows correct durations for these episodes — confirming the audio files themselves are intact and their embedded metadata is genuinely readable. This backfill is purely populating a stale/never-set column from data that demonstrably already exists and is readable.

**Existing, established pattern this plan extends** (`server/scripts/backfill-durations.mjs`, already in the repo, already run once against production on 2026-07-13 per its own header): reads audio files directly via `music-metadata` (a server devDependency, never part of the production image) and writes `duration_seconds` for rows matching `audio_type = 'upload' AND (duration_seconds IS NULL OR duration_seconds = 0)`. Supports a dry-run mode (default, no `--apply`) that only prints what it would change. This plan adds a `--season-id=<id>` filter to that existing script (backward compatible — omitting it preserves today's all-seasons behavior) rather than writing a new one-off script, so the enhancement is reusable for the remaining ~44 affected episodes in other seasons later.

**Files involved:** `server/scripts/backfill-durations.mjs` (add the season filter + update its header/status comments — a normal, reviewed code change on its own branch/PR, not a production-only hotfix).

**Deployment mechanics** (per CLAUDE.md's documented one-off-script pattern, already used for this exact script once before): runs in a disposable container sharing the already-deployed image, with the real data directory mounted — never touches or restarts the live `ear-candy` container itself. `music-metadata` is installed fresh into the throwaway container at run time (`npm install music-metadata --no-save`), never added to the production image's own dependencies.

**Explicitly out of scope:** fixing the 8-second timeout bug in `probeAudioDuration` (a separate, already-diagnosed follow-up); backfilling the other ~44 affected episodes in Seasons 2-4 (deliberately deferred until this smaller, easier-to-verify batch confirms the approach is safe in practice); any change to the admin form or API routes.

## Steps

### Step 1: Add a `--season-id` filter to `backfill-durations.mjs`

**Files:** `server/scripts/backfill-durations.mjs`

**Requires review:** false

Add an optional `--season-id=<id>` CLI flag. When present, the query becomes:
```sql
SELECT id, title, audio_path FROM episodes
WHERE audio_type = 'upload' AND (duration_seconds IS NULL OR duration_seconds = 0)
  AND season_id = ?
```
When absent, behavior is unchanged (all seasons, matching today's script exactly) — this must stay backward compatible since the script's existing header describes it as safe to re-run broadly. Update the script's header comment: add a new dated status line for this run once it's actually executed (Step 6), noting the season-scoping addition and which episode IDs it fixed, following the same documentation convention as the existing 2026-07-13 status note.

**Acceptance criteria:**
- [ ] `node backfill-durations.mjs --season-id=69` (dry run) against a local copy of the schema only selects Season-1, zero-duration, upload-type rows.
- [ ] `node backfill-durations.mjs` (no flag) still selects the same full set it did before this change — confirmed by reading the generated SQL/query plan, not just assuming.
- [ ] No changes to any other file — this is a single-file, backward-compatible script enhancement.

---

### Step 2: Ship the script change through the normal workflow

**Files:** none beyond Step 1's

**Requires review:** false

This is ordinary code — branch off `dev`, commit, push, PR into `dev`, merge, following this repo's standard workflow (same as every other change this session). Do **not** fold the actual production data operation (Steps 3-7 below) into this PR — the script change and the act of running it against production are deliberately separate: the PR ships a reusable tool, the SSH session afterward is a supervised, manual, one-off operation against live data, matching how `backfill-durations.mjs` was used the first time.

**Acceptance criteria:**
- [ ] `make test`, `make lint` pass (no client/server logic touched, but run the gate anyway — this is a real repo convention, not optional).
- [ ] PR merged into `dev`. (Promoting to `main` is not required for this script to be usable via SSH — it never ships as part of the deployed image — but do it anyway for repo hygiene/history, on your own judgment; not a hard blocker for Step 3 onward, which only needs the script file itself, copied via `scp`.)

---

### Step 3: Pre-flight backup of the production database

**Files:** none (production operation only)

**Requires review:** true — the first live-data-touching step. Confirm the backup actually exists and is restorable before proceeding to Step 4.

Via `ssh earcandy`:
1. Checkpoint the WAL so the backup captures all recent writes (mirrors exactly what `migrate.ts` already does automatically before schema migrations — same reasoning applies here even though this isn't a migration):
   ```
   docker exec ear-candy node -e "new (require('/app/node_modules/better-sqlite3'))('/app/data/db.sqlite').pragma('wal_checkpoint(TRUNCATE)')"
   ```
2. Copy the database file to a clearly-named, clearly-scoped backup (distinct from `migrate.ts`'s own `pre-migration-*.bak` naming, so the two mechanisms are never confused when someone's cleaning up old backups later):
   ```
   docker exec ear-candy cp /app/data/db.sqlite /app/data/db.sqlite.pre-backfill-season1-<ISO-timestamp>.bak
   ```
3. Copy that backup file off the droplet to the local machine too (`scp earcandy:/opt/ear-candy/data/db.sqlite.pre-backfill-season1-*.bak ./`) — belt-and-suspenders beyond what `migrate.ts`'s own backups get, specifically because this is a manually-triggered write outside the deploy pipeline's own safety net, not an automated migration with an established recovery drill already documented in CLAUDE.md.

**Acceptance criteria:**
- [ ] Backup file exists on the droplet at the expected path and is non-trivial in size (sanity check: roughly matches the live `db.sqlite`'s current size, not 0 bytes or truncated).
- [ ] A copy of the same backup file exists locally, off the droplet entirely.
- [ ] Confirm (by inspecting the backup with a read-only query, same pattern as the investigation queries already run) that it contains the expected 25 Season-1 rows with their current (mostly-zero) durations — proves the backup is a valid, queryable SQLite file, not a corrupted copy.

---

### Step 4: Dry run against production, scoped to Season 1

**Files:** none (production operation only)

**Requires review:** false (Step 3's gate already covers "are we safe to proceed"; this step makes no writes)

Following the existing documented pattern:
```bash
scp server/scripts/backfill-durations.mjs earcandy:/opt/ear-candy/
ssh earcandy
docker run --rm \
  -v /opt/ear-candy/data:/app/data \
  -v /opt/ear-candy/backfill-durations.mjs:/app/backfill-durations.mjs \
  -w /app \
  $(docker inspect ear-candy --format='{{.Config.Image}}') \
  sh -c 'npm install music-metadata --no-save && node backfill-durations.mjs --season-id=69'
```
(No `--apply` — dry run only.) Review the printed output line by line: expect exactly 22 "would update" lines, one per episode `id` 101-122, each with a plausible duration (a podcast episode: expect roughly 20-90 minutes / 1200-5400 seconds given this show's other known durations — flag anything wildly outside that range, e.g. a few seconds or many hours, as a reason to stop and investigate before Step 5, not just an oddity to note). Expect zero "skip" lines (all 22 files are already confirmed present on disk from the investigation above).

**Acceptance criteria:**
- [ ] Exactly the 22 expected episode IDs appear as "would update", no more, no fewer.
- [ ] Every printed duration is plausible for this show (roughly 1200-5400s) — anything outside that range is investigated before proceeding, not applied blind.
- [ ] Zero unexpected "skip" (file-not-found/parse-error) lines. If any appear, investigate that specific episode before proceeding — do not apply partial results without understanding why a file failed.

---

### Step 5: Apply the backfill

**Files:** none (production operation only)

**Requires review:** true — the actual live write. Only proceed if Step 4's dry-run output was fully reviewed and matched expectations exactly.

Re-run the identical command from Step 4 with `--apply` appended. The live `ear-candy` container is never stopped or restarted for this — it keeps serving traffic throughout, from the same SQLite file the throwaway container is writing to (WAL mode supports this; the write volume here is 22 small `UPDATE ... WHERE id = ?` statements, not a bulk rewrite).

**Acceptance criteria:**
- [ ] Script reports "Updated 22 episode(s), skipped 0" (or fewer if Step 4 already flagged specific episodes to exclude — but by default, expect all 22).
- [ ] The live site (`ear-candy` container) is confirmed still up and responding throughout — spot-check `curl -sf http://localhost:3000/api/health` on the droplet immediately after the apply run.

---

### Step 6: Verify the result

**Files:** `server/scripts/backfill-durations.mjs` (header comment update only, from Step 1's placeholder)

**Requires review:** false

1. Read-only re-query (same pattern as the original investigation): confirm all 22 previously-zero Season-1 episodes now have positive `duration_seconds`, and the 3 already-correct ones (96-98) are unchanged.
2. Load the live production site in a real browser, view Season 1's episode list, confirm every row now shows a real duration instead of `0:00`.
3. Update `backfill-durations.mjs`'s header comment with a new dated STATUS line (mirroring the existing 2026-07-13 entry) recording this run: date, `--season-id=69`, episode IDs fixed. Commit this as a small follow-up change (documentation only, no behavior change) on its own branch/PR — keep the historical record accurate for whoever runs the remaining-seasons backfill later.

**Acceptance criteria:**
- [ ] Database confirms 25/25 Season-1 episodes now have non-zero `duration_seconds`.
- [ ] Live site visually confirms correct durations in Season 1's episode list.
- [ ] Script header updated and merged.

---

### Step 7: Clean up

**Files:** none (production operation only)

**Requires review:** false

Delete the copied script from the droplet (`ssh earcandy rm /opt/ear-candy/backfill-durations.mjs`) — it's not meant to persist there, per existing convention. Leave the pre-backfill backup file in place on the droplet (matches this repo's existing "no automatic pruning, periodic manual cleanup expected" convention for `.bak` files) — do not delete it as part of this cleanup step; it's the recovery point for this operation and should outlive the session that created it.

**Acceptance criteria:**
- [ ] `/opt/ear-candy/backfill-durations.mjs` no longer exists on the droplet.
- [ ] Both backup copies (droplet + local) still exist and are untouched.

---

### Step 8: Decide on the remaining seasons

**Files:** none — decision/handoff only

**Requires review:** false

~44 episodes across Seasons 2-4 have the same `duration_seconds = 0` issue and are deliberately not touched by this plan. Once Season 1's backfill is verified clean (Step 6) with no surprises, report back and get an explicit decision on whether to repeat Steps 3-7 for the remaining seasons in the same session, or as separate follow-up work. Do not proceed to the other seasons automatically just because Season 1 went well — each season's episodes came from different upload sessions and haven't been individually dry-run-reviewed yet.

**Acceptance criteria:**
- [ ] Season 1's result explicitly reported back before touching any other season.

## Disaster Recovery Plan

This operates on the live production database outside the normal deploy pipeline's own safety net (`migrate.ts`'s automatic pre-migration backup only fires for schema migrations, not for a one-off data-repair script like this one) — so this plan builds its own explicit backup/restore drill rather than relying on that mechanism.

**What could actually go wrong here, and the response for each:**

1. **The script writes a wrong or corrupted duration value to one or more rows.** Lowest-risk failure mode structurally — Step 4's dry run reviews every value *before* anything is written, specifically to catch this in advance. If a bad value still slips through: it's a single-column, single-row problem — `UPDATE episodes SET duration_seconds = <correct value> WHERE id = <id>` by hand fixes it directly, no restore needed. Re-run the script's own logic for that one episode if the correct value isn't already known from Step 4's dry-run output.

2. **The apply run fails partway through (crashes, network drop mid-SSH-session, etc.).** The existing script processes episodes one at a time with an individual try/catch per row — a mid-run failure leaves some rows updated and others still at `duration_seconds = 0`, which is a safe, idempotent, *incomplete* state, not a corrupted one. Recovery is simply re-running the same dry-run-then-apply sequence again — it will only pick up whatever's still at `0`.

3. **Concurrent write contention with the live app** (the running `ear-candy` container and the throwaway backfill container both writing to the same SQLite file at the same time). SQLite's WAL mode is designed for exactly this (one writer, multiple readers, with the writer's transaction committing atomically) — but if this ever manifests as a locked-database error or a hung write: stop the throwaway container (`docker stop <container>` — it's disposable, this has zero effect on the live app), confirm the live `ear-candy` container is still healthy (`curl -sf http://localhost:3000/api/health` from the droplet), and retry the backfill once confirmed clear. Never kill or restart the live container to resolve this — it isn't the one at risk.

4. **Something goes wrong badly enough that a full restore is warranted** (data looks broadly wrong across many rows, not just one; the database file itself appears corrupted; anything not covered cleanly by #1-#3 above). Full recovery procedure, adapted from CLAUDE.md's existing documented migration-recovery drill:
   - `docker stop ear-candy` on the droplet.
   - Replace `/opt/ear-candy/data/db.sqlite` with the Step 3 backup (`db.sqlite.pre-backfill-season1-<timestamp>.bak`).
   - Delete any `db.sqlite-wal`/`db.sqlite-shm` siblings alongside it (they reference the now-replaced file and would otherwise silently reintroduce whatever was in-flight at backup time, or fail to open against the restored file).
   - `docker start ear-candy`.
   - Verify `curl -sf http://localhost:3000/api/health` succeeds and the site loads normally.
   - This restores Season 1 to its exact pre-backfill state (`duration_seconds = 0` for the 22 episodes) — a known-safe, already-shipped state, not a regression beyond where things stood before this plan started. Re-diagnose from the dry-run output before attempting the backfill again.

**What this DR plan deliberately does not need to cover:** no schema changes are involved (ruled out explicitly before any of this work began), so there's no migration-version rollback concern, no `schema_migrations` table state to reconcile, and no risk to any table other than `episodes`' `duration_seconds` column specifically (the script's own `UPDATE` statement is scoped to exactly that).

## Notes

- Deliberately scoped to Season 1 only, not all 66 affected episodes across the site, so the first real production run of this enhanced script is small enough to review every single row's dry-run output by hand (Step 4) rather than skimming 66 lines and missing something.
- Keeping duration detection client-side (per explicit decision) means the 8-second-timeout root cause itself is still live — any *new* large upload-type episode created going forward can still hit the same bug. That's out of scope here but worth a follow-up plan of its own if it's worth fixing rather than living with (e.g., admins learning to double-check the "Duration: ..." confirmation text in the form before saving, given the timeout gap won't fix itself).
