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
//   node backfill-durations.mjs              # dry run, prints what it would change
//   node backfill-durations.mjs --apply      # actually writes the changes
//
// Env vars (defaults match the layout inside the production container):
//   DB_PATH      default: data/db.sqlite
//   UPLOADS_DIR  default: data/uploads

import Database from 'better-sqlite3'
import { parseFile } from 'music-metadata'
import path from 'node:path'
import fs from 'node:fs'

const DB_PATH = process.env.DB_PATH || 'data/db.sqlite'
const UPLOADS_DIR = process.env.UPLOADS_DIR || 'data/uploads'
const APPLY = process.argv.includes('--apply')

const db = new Database(DB_PATH, { readonly: !APPLY })

const rows = db.prepare(
  `SELECT id, title, audio_path FROM episodes WHERE audio_type = 'upload' AND (duration_seconds IS NULL OR duration_seconds = 0)`
).all()

console.log(`${APPLY ? 'APPLY mode' : 'DRY RUN'} — DB: ${DB_PATH}, uploads: ${UPLOADS_DIR}`)
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
