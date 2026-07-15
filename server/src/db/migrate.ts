import type { Database } from 'better-sqlite3'
import fs from 'node:fs'

function columnExists(db: Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return cols.some(c => c.name === column)
}

interface Migration {
  version: number
  description: string
  /** True if this migration's change is already present — used to backfill
   *  `schema_migrations` for databases that had this column before version
   *  tracking existed, without re-running (and erroring on) the ALTER TABLE. */
  alreadyApplied: (db: Database) => boolean
  up: (db: Database) => void
}

// Only additive, nullable-column changes belong here — SQLite's ALTER TABLE
// can't safely express anything more invasive (no DROP COLUMN before 3.35,
// no easy type changes), and there's still no down()/rollback mechanism, so
// a migration that needs one is a sign this pattern has been outgrown (see
// issue #18). Each version is backed up for automatically before it first
// runs against a real database — see `backupBeforeMigration` below.
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'episodes.cover_art_thumb_path',
    alreadyApplied: db => columnExists(db, 'episodes', 'cover_art_thumb_path'),
    up: db => { db.prepare('ALTER TABLE episodes ADD COLUMN cover_art_thumb_path TEXT').run() },
  },
  {
    version: 2,
    description: 'settings.favicon_path',
    alreadyApplied: db => columnExists(db, 'settings', 'favicon_path'),
    up: db => { db.prepare('ALTER TABLE settings ADD COLUMN favicon_path TEXT').run() },
  },
  {
    version: 3,
    description: 'settings.browser_tab_title',
    alreadyApplied: db => columnExists(db, 'settings', 'browser_tab_title'),
    up: db => { db.prepare('ALTER TABLE settings ADD COLUMN browser_tab_title TEXT').run() },
  },
]

/**
 * Copies the SQLite file to a timestamped `.pre-migration-<ts>.bak` sibling
 * before any pending migration runs — a known-good snapshot from the exact
 * moment before the schema changed, independent of the regular backup
 * cadence. Manual recovery: stop the container, replace `db.sqlite` with
 * the backup file, restart (see CLAUDE.md's Database gotchas).
 *
 * Checkpoints the WAL first so the copy is a complete, self-contained
 * snapshot — a raw copy of the main file alone could miss recent writes
 * that are still only in `-wal` (WAL mode is enabled — see `db/index.ts`).
 */
function backupBeforeMigration(db: Database, dbPath: string): void {
  db.pragma('wal_checkpoint(TRUNCATE)')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  fs.copyFileSync(dbPath, `${dbPath}.pre-migration-${timestamp}.bak`)
}

export function runMigrations(db: Database, opts: { dbPath?: string } = {}): void {
  // Baseline schema — always safe/idempotent (CREATE TABLE IF NOT EXISTS),
  // not version-tracked since there's nothing to roll back to.
  db.prepare(`
    CREATE TABLE IF NOT EXISTS settings (
      podcast_name   TEXT NOT NULL DEFAULT 'Ear Candy',
      tagline        TEXT NOT NULL DEFAULT '',
      description    TEXT NOT NULL DEFAULT '',
      cover_art_path TEXT,
      accent_color   TEXT NOT NULL DEFAULT '#5a3ef5'
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS seasons (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      number         INTEGER NOT NULL,
      title          TEXT NOT NULL,
      description    TEXT NOT NULL DEFAULT '',
      cover_art_path TEXT,
      hidden         INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS episodes (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id        INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
      number           INTEGER NOT NULL,
      title            TEXT NOT NULL,
      description      TEXT NOT NULL DEFAULT '',
      guests           TEXT NOT NULL DEFAULT '',
      tags             TEXT NOT NULL DEFAULT '',
      cover_art_path   TEXT,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      publish_date     TEXT NOT NULL,
      audio_type       TEXT NOT NULL CHECK(audio_type IN ('upload','url')),
      audio_path       TEXT NOT NULL,
      hidden           INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run()

  const appliedVersions = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(r => r.version)
  )
  const pending = MIGRATIONS.filter(m => !appliedVersions.has(m.version))

  if (pending.length > 0 && opts.dbPath && opts.dbPath !== ':memory:' && fs.existsSync(opts.dbPath)) {
    backupBeforeMigration(db, opts.dbPath)
  }

  for (const migration of pending) {
    // Column may already exist on a database that predates version
    // tracking — record it as applied without re-running the ALTER TABLE
    // (which would error on a duplicate column).
    if (!migration.alreadyApplied(db)) {
      migration.up(db)
    }
    db.prepare('INSERT INTO schema_migrations (version, description) VALUES (?, ?)').run(migration.version, migration.description)
  }

  const { c } = db.prepare('SELECT COUNT(*) as c FROM settings').get() as { c: number }
  if (c === 0) {
    db.prepare('INSERT INTO settings DEFAULT VALUES').run()
  }
}
