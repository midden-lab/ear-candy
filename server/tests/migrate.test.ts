import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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

  it('creates favicon_path on a fresh database', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    expect(columns(db, 'settings')).toContain('favicon_path')
  })

  it('adds favicon_path to a pre-existing settings table that predates the column', () => {
    // Simulate a production DB created before this migration existed: the
    // settings table exists (with a row already inserted) but lacks favicon_path.
    const db = new Database(':memory:')
    db.prepare(`
      CREATE TABLE settings (
        podcast_name   TEXT NOT NULL DEFAULT 'Ear Candy',
        tagline        TEXT NOT NULL DEFAULT '',
        description    TEXT NOT NULL DEFAULT '',
        cover_art_path TEXT,
        accent_color   TEXT NOT NULL DEFAULT '#5a3ef5'
      )
    `).run()
    db.prepare('INSERT INTO settings DEFAULT VALUES').run()
    expect(columns(db, 'settings')).not.toContain('favicon_path')

    runMigrations(db)

    expect(columns(db, 'settings')).toContain('favicon_path')
    // The existing row survives the migration untouched, still a singleton.
    const row = db.prepare('SELECT * FROM settings').get() as { podcast_name: string }
    expect(row.podcast_name).toBe('Ear Candy')
    expect(db.prepare('SELECT COUNT(*) as c FROM settings').get()).toEqual({ c: 1 })
  })

  it('creates browser_tab_title on a fresh database', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    expect(columns(db, 'settings')).toContain('browser_tab_title')
  })

  it('adds browser_tab_title to a pre-existing settings table that predates the column, preserving podcast_name', () => {
    // Simulate a production DB with real data set before this migration
    // existed: podcast_name and favicon_path already customized.
    const db = new Database(':memory:')
    db.prepare(`
      CREATE TABLE settings (
        podcast_name   TEXT NOT NULL DEFAULT 'Ear Candy',
        tagline        TEXT NOT NULL DEFAULT '',
        description    TEXT NOT NULL DEFAULT '',
        cover_art_path TEXT,
        favicon_path   TEXT,
        accent_color   TEXT NOT NULL DEFAULT '#5a3ef5'
      )
    `).run()
    db.prepare(
      'INSERT INTO settings (podcast_name, favicon_path) VALUES (?, ?)'
    ).run('Positive Sex Ed', '/images/favicon-real.png')
    expect(columns(db, 'settings')).not.toContain('browser_tab_title')

    runMigrations(db)

    expect(columns(db, 'settings')).toContain('browser_tab_title')
    const row = db.prepare('SELECT * FROM settings').get() as { podcast_name: string; favicon_path: string; browser_tab_title: string | null }
    // Existing customized data survives untouched; new column starts null,
    // which is exactly what makes the client-side fallback to podcast_name work.
    expect(row.podcast_name).toBe('Positive Sex Ed')
    expect(row.favicon_path).toBe('/images/favicon-real.png')
    expect(row.browser_tab_title).toBeNull()
  })

  describe('events table', () => {
    it('creates the events table with the expected columns on a fresh database', () => {
      const db = new Database(':memory:')
      runMigrations(db)
      expect(columns(db, 'events')).toEqual([
        'id', 'event_type', 'episode_id', 'season_id', 'session_id',
        'position_pct', 'referrer', 'country', 'device_type', 'os', 'browser', 'created_at',
      ])
    })

    it('creates the expected indexes on events', () => {
      const db = new Database(':memory:')
      runMigrations(db)
      const indexes = (db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='events'").all() as { name: string }[]).map(r => r.name)
      expect(indexes).toContain('idx_events_episode_id')
      expect(indexes).toContain('idx_events_created_at')
      expect(indexes).toContain('idx_events_session_dedup')
    })

    it('rejects an invalid event_type via the CHECK constraint', () => {
      const db = new Database(':memory:')
      runMigrations(db)
      expect(() => db.prepare(
        "INSERT INTO events (event_type, session_id) VALUES ('bogus', 'abc')"
      ).run()).toThrow()
    })

    it('rejects an out-of-range position_pct via the CHECK constraint', () => {
      const db = new Database(':memory:')
      runMigrations(db)
      expect(() => db.prepare(
        "INSERT INTO events (event_type, session_id, position_pct) VALUES ('listen_progress', 'abc', 33)"
      ).run()).toThrow()
    })

    it('running migrations twice does not error and the table survives intact', () => {
      const db = new Database(':memory:')
      runMigrations(db)
      expect(() => runMigrations(db)).not.toThrow()
      expect(columns(db, 'events')).toContain('id')
    })
  })

  it('creates analytics_enabled and track_returning_listeners on a fresh database, defaulted to enabled', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    expect(columns(db, 'settings')).toContain('analytics_enabled')
    expect(columns(db, 'settings')).toContain('track_returning_listeners')
    const row = db.prepare('SELECT analytics_enabled, track_returning_listeners FROM settings').get() as { analytics_enabled: number; track_returning_listeners: number }
    expect(row.analytics_enabled).toBe(1)
    expect(row.track_returning_listeners).toBe(1)
  })

  it('adds analytics_enabled and track_returning_listeners to a pre-existing settings table that predates the columns', () => {
    // Simulate a production DB at schema version 3 — settings exists with a
    // customized row, but lacks both analytics toggle columns.
    const db = new Database(':memory:')
    db.prepare(`
      CREATE TABLE settings (
        podcast_name       TEXT NOT NULL DEFAULT 'Ear Candy',
        tagline            TEXT NOT NULL DEFAULT '',
        description        TEXT NOT NULL DEFAULT '',
        cover_art_path     TEXT,
        favicon_path       TEXT,
        browser_tab_title  TEXT,
        accent_color       TEXT NOT NULL DEFAULT '#5a3ef5'
      )
    `).run()
    db.prepare('INSERT INTO settings (podcast_name) VALUES (?)').run('Pre-Analytics Pod')
    expect(columns(db, 'settings')).not.toContain('analytics_enabled')

    runMigrations(db)

    expect(columns(db, 'settings')).toContain('analytics_enabled')
    expect(columns(db, 'settings')).toContain('track_returning_listeners')
    const row = db.prepare('SELECT podcast_name, analytics_enabled, track_returning_listeners FROM settings').get() as { podcast_name: string; analytics_enabled: number; track_returning_listeners: number }
    expect(row.podcast_name).toBe('Pre-Analytics Pod')
    expect(row.analytics_enabled).toBe(1)
    expect(row.track_returning_listeners).toBe(1)
  })

  it('creates session_epoch on a fresh database, defaulted to 0', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    expect(columns(db, 'settings')).toContain('session_epoch')
    const row = db.prepare('SELECT session_epoch FROM settings').get() as { session_epoch: number }
    expect(row.session_epoch).toBe(0)
  })

  it('adds session_epoch to a pre-existing settings table that predates the column', () => {
    // Simulate a production DB at schema version 5 — settings exists, but
    // lacks session_epoch (issue #34's server-side session revocation).
    const db = new Database(':memory:')
    db.prepare(`
      CREATE TABLE settings (
        podcast_name               TEXT NOT NULL DEFAULT 'Ear Candy',
        tagline                    TEXT NOT NULL DEFAULT '',
        description                TEXT NOT NULL DEFAULT '',
        cover_art_path             TEXT,
        favicon_path                TEXT,
        browser_tab_title          TEXT,
        accent_color                TEXT NOT NULL DEFAULT '#5a3ef5',
        analytics_enabled           INTEGER NOT NULL DEFAULT 1,
        track_returning_listeners   INTEGER NOT NULL DEFAULT 1
      )
    `).run()
    db.prepare('INSERT INTO settings (podcast_name) VALUES (?)').run('Pre-Revocation Pod')
    expect(columns(db, 'settings')).not.toContain('session_epoch')

    runMigrations(db)

    expect(columns(db, 'settings')).toContain('session_epoch')
    const row = db.prepare('SELECT podcast_name, session_epoch FROM settings').get() as { podcast_name: string; session_epoch: number }
    expect(row.podcast_name).toBe('Pre-Revocation Pod')
    expect(row.session_epoch).toBe(0)
  })

  describe('schema_migrations tracking', () => {
    it('records all six migrations as applied on a fresh database', () => {
      const db = new Database(':memory:')
      runMigrations(db)
      const rows = db.prepare('SELECT version, description FROM schema_migrations ORDER BY version').all()
      expect(rows).toEqual([
        { version: 1, description: 'episodes.cover_art_thumb_path' },
        { version: 2, description: 'settings.favicon_path' },
        { version: 3, description: 'settings.browser_tab_title' },
        { version: 4, description: 'settings.analytics_enabled' },
        { version: 5, description: 'settings.track_returning_listeners' },
        { version: 6, description: 'settings.session_epoch' },
      ])
    })

    it('backfills schema_migrations for a pre-existing database that already has all the columns, without re-running any ALTER TABLE', () => {
      const db = new Database(':memory:')
      // First run establishes the columns and schema_migrations rows...
      runMigrations(db)
      // ...delete the tracking rows only, simulating a DB that had the
      // columns before version tracking was introduced.
      db.prepare('DELETE FROM schema_migrations').run()

      expect(() => runMigrations(db)).not.toThrow()
      const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all()
      expect(rows).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }, { version: 6 }])
    })

    it('running migrations again with everything already applied is a no-op', () => {
      const db = new Database(':memory:')
      runMigrations(db)
      const before = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all()
      runMigrations(db)
      const after = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all()
      expect(after).toEqual(before)
    })
  })

  describe('pre-migration backup', () => {
    let tmpDir: string
    let dbPath: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ear-candy-migrate-test-'))
      dbPath = path.join(tmpDir, 'db.sqlite')
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true })
    })

    function backupFiles(): string[] {
      return fs.readdirSync(tmpDir).filter(f => f.includes('.pre-migration-'))
    }

    it('creates a timestamped backup file before running pending migrations against a real file-backed database', () => {
      const db = new Database(dbPath)
      db.pragma('journal_mode = WAL')
      expect(backupFiles()).toHaveLength(0)

      runMigrations(db, { dbPath })

      expect(backupFiles()).toHaveLength(1)
      expect(backupFiles()[0]).toMatch(/^db\.sqlite\.pre-migration-.+\.bak$/)
    })

    it('does not create a backup on a second run once everything is already applied', () => {
      const db = new Database(dbPath)
      db.pragma('journal_mode = WAL')
      runMigrations(db, { dbPath })
      expect(backupFiles()).toHaveLength(1)

      runMigrations(db, { dbPath })
      expect(backupFiles()).toHaveLength(1)
    })

    it('does not create a backup for :memory: databases even when dbPath is passed', () => {
      const db = new Database(':memory:')
      expect(() => runMigrations(db, { dbPath: ':memory:' })).not.toThrow()
    })

    it('the backup file is a valid, restorable SQLite database reflecting the pre-migration schema', () => {
      // Pre-create a settings table missing browser_tab_title, matching a
      // real pre-migration production DB, with a real customized row.
      const seed = new Database(dbPath)
      seed.pragma('journal_mode = WAL')
      seed.prepare(`
        CREATE TABLE settings (
          podcast_name   TEXT NOT NULL DEFAULT 'Ear Candy',
          tagline        TEXT NOT NULL DEFAULT '',
          description    TEXT NOT NULL DEFAULT '',
          cover_art_path TEXT,
          favicon_path   TEXT,
          accent_color   TEXT NOT NULL DEFAULT '#5a3ef5'
        )
      `).run()
      seed.prepare('INSERT INTO settings (podcast_name) VALUES (?)').run('Backup Test Pod')
      seed.close()

      const db = new Database(dbPath)
      db.pragma('journal_mode = WAL')
      runMigrations(db, { dbPath })
      db.close()

      const backupPath = path.join(tmpDir, backupFiles()[0])
      const restored = new Database(backupPath, { readonly: true })
      const cols = (restored.prepare('PRAGMA table_info(settings)').all() as { name: string }[]).map(c => c.name)
      // The backup reflects state as of right before this run's migration —
      // browser_tab_title had not been added yet.
      expect(cols).not.toContain('browser_tab_title')
      const row = restored.prepare('SELECT podcast_name FROM settings').get() as { podcast_name: string }
      expect(row.podcast_name).toBe('Backup Test Pod')
      restored.close()
    })
  })
})
