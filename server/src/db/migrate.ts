import type { Database } from 'better-sqlite3'

export function runMigrations(db: Database): void {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS settings (
      podcast_name   TEXT NOT NULL DEFAULT 'My Podcast',
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

  const { c } = db.prepare('SELECT COUNT(*) as c FROM settings').get() as { c: number }
  if (c === 0) {
    db.prepare('INSERT INTO settings DEFAULT VALUES').run()
  }
}
