import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../src/db/migrate.js'

function columns(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(c => c.name)
}

describe('runMigrations', () => {
  it('creates cover_art_thumb_path on a fresh database', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    expect(columns(db, 'episodes')).toContain('cover_art_thumb_path')
  })

  it('is idempotent — running twice does not error and columns stay intact', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    expect(() => runMigrations(db)).not.toThrow()
    expect(columns(db, 'episodes')).toContain('cover_art_thumb_path')
  })

  it('adds cover_art_thumb_path to a pre-existing episodes table that predates the column', () => {
    // Simulate a production DB created before this migration existed: the
    // episodes table exists but lacks cover_art_thumb_path.
    const db = new Database(':memory:')
    db.prepare(`
      CREATE TABLE seasons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        cover_art_path TEXT,
        hidden INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run()
    db.prepare(`
      CREATE TABLE episodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
        number INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        guests TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '',
        cover_art_path TEXT,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        publish_date TEXT NOT NULL,
        audio_type TEXT NOT NULL CHECK(audio_type IN ('upload','url')),
        audio_path TEXT NOT NULL,
        hidden INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run()
    expect(columns(db, 'episodes')).not.toContain('cover_art_thumb_path')

    runMigrations(db)

    expect(columns(db, 'episodes')).toContain('cover_art_thumb_path')
    // Existing table's data-bearing columns are untouched by the migration.
    expect(columns(db, 'episodes')).toContain('cover_art_path')
  })
})
