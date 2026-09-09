#!/usr/bin/env node
// One-off maintenance script: populates duration_seconds for existing
// upload-type episodes that predate the auto-detect-on-save feature.
//
// URL-type episodes are NOT touched here — they self-heal automatically the
// next time an admin edits and saves (the form re-probes the URL
// unconditionally on every submit). Upload-type episodes only re-probe when
// a new file is explicitly re-selected, so anything created before the fix
// is stuck at duration_seconds = 0 until this backfill runs.
//
// Usage:
//   node backfill-durations.mjs                       # dry run, all seasons
//   node backfill-durations.mjs --apply                # apply, all seasons
//   node backfill-durations.mjs --season-id=69          # dry run, one season only
//   node backfill-durations.mjs --season-id=69 --apply  # apply, one season only
//
// --season-id is optional and additive to the existing WHERE clause — a
// season_id filter narrows the same query, it doesn't change what counts
// as "missing duration". Omitting it preserves the original all-seasons
// behavior exactly (plans/013).
//
// Env vars (defaults match the layout inside the production container):
//   DB_PATH      default: data/db.sqlite
//   UPLOADS_DIR  default: data/uploads
//
// STATUS:
// - 2026-07-13 (--apply, no --season-id yet): fixed episodes #96-#100 (all
//   upload-type episodes with duration_seconds = 0 at the time).
// - 2026-09-08 (--apply --season-id=69, plans/013): fixed episodes #101-122
//   (Season 1's remaining 22 zero-duration episodes, from a single Aug
//   11-12 admin session whose uploads — large, ~57-58MB files — silently
//   timed out the client-side duration probe at save time; see plans/013's
//   Context for the full root-cause investigation).
// - 2026-09-08 (--apply --season-id=71/72/73, same session as above): fixed
//   the remaining 44 episodes across Seasons 2-4 (#123-166) — same root
//   cause. Site-wide duration_seconds = 0 count confirmed at 0 afterward.
// Safe to re-run if the gap ever resurfaces — it's idempotent, only
// touching rows still at duration_seconds = 0/NULL. The underlying
// client-side timeout bug itself (EpisodeFormPanel.tsx's probeAudioDuration,
// 8s) is NOT fixed by this script — any new large upload-type episode can
// still hit it; re-run this script per-season as needed until that's
// addressed separately (detection stays client-side per explicit decision).
//
// Operational note: running `npm install <pkg> --no-save` directly in
// /app (as the one-off-script procedure below describes) can silently
// no-op — "up to date, audited N packages" with nothing actually added —
// when NODE_ENV=production is set (it is, in the deployed image) combined
// with /app's own package-lock.json. Confirmed working around this by
// installing into an unrelated scratch directory instead and copying the
// result into /app/node_modules:
//   mkdir -p /tmp/scratch && cd /tmp/scratch && npm init -y &&
//   npm install <pkg> --silent && cp -r node_modules/. /app/node_modules/
// NODE_PATH does NOT help here even though it looks like it should — it
// only affects CommonJS require() resolution, not ESM import (which this
// script and this whole codebase use throughout).

import Database from 'better-sqlite3'
import { parseFile } from 'music-metadata'
import path from 'node:path'
import fs from 'node:fs'

const DB_PATH = process.env.DB_PATH || 'data/db.sqlite'
const UPLOADS_DIR = process.env.UPLOADS_DIR || 'data/uploads'
const APPLY = process.argv.includes('--apply')
const SEASON_ID_ARG = process.argv.find(a => a.startsWith('--season-id='))
const SEASON_ID = SEASON_ID_ARG ? Number(SEASON_ID_ARG.split('=')[1]) : undefined
if (SEASON_ID_ARG && (!Number.isInteger(SEASON_ID) || SEASON_ID <= 0)) {
  console.error(`Invalid --season-id value: "${SEASON_ID_ARG}"`)
  process.exit(1)
}

const db = new Database(DB_PATH, { readonly: !APPLY })

const query = SEASON_ID
  ? `SELECT id, title, audio_path FROM episodes WHERE audio_type = 'upload' AND (duration_seconds IS NULL OR duration_seconds = 0) AND season_id = ?`
  : `SELECT id, title, audio_path FROM episodes WHERE audio_type = 'upload' AND (duration_seconds IS NULL OR duration_seconds = 0)`
const rows = SEASON_ID ? db.prepare(query).all(SEASON_ID) : db.prepare(query).all()

console.log(`${APPLY ? 'APPLY mode' : 'DRY RUN'} — DB: ${DB_PATH}, uploads: ${UPLOADS_DIR}${SEASON_ID ? `, season_id: ${SEASON_ID}` : ''}`)
console.log(`Found ${rows.length} upload-type episode(s) with missing duration.\n`)

let updated = 0
let skipped = 0

for (const row of rows) {
  const filename = row.audio_path.replace(/^\/audio\//, '')
  const filePath = path.join(UPLOADS_DIR, filename)

  if (!fs.existsSync(filePath)) {
    console.log(`  [skip] #${row.id} "${row.title}" — file not found: ${filePath}`)
    skipped++
    continue
  }

  try {
    const metadata = await parseFile(filePath)
    const duration = metadata.format.duration
    if (!duration || !Number.isFinite(duration)) {
      console.log(`  [skip] #${row.id} "${row.title}" — could not determine duration`)
      skipped++
      continue
    }
    const seconds = Math.round(duration)
    console.log(`  [${APPLY ? 'updated' : 'would update'}] #${row.id} "${row.title}" -> ${seconds}s`)
    if (APPLY) {
      db.prepare('UPDATE episodes SET duration_seconds = ? WHERE id = ?').run(seconds, row.id)
    }
    updated++
  } catch (err) {
    console.log(`  [skip] #${row.id} "${row.title}" — parse error: ${err instanceof Error ? err.message : err}`)
    skipped++
  }
}

console.log(`\n${APPLY ? 'Updated' : 'Would update'} ${updated} episode(s), skipped ${skipped}.`)
if (!APPLY) console.log('Run again with --apply to write these changes.')

db.close()
