import type { Database } from 'better-sqlite3'

// Optional, OPT-IN retention for the analytics `events` table (security
// audit M5 / issue #102). The table otherwise grows forever on the same
// volume as the database and uploads.
//
// Deleting analytics history is permanent, so everything here defaults to
// "do nothing": retention only runs when EVENTS_RETENTION_DAYS is set to an
// integer of at least MIN_RETENTION_DAYS. Anything else — unset, empty,
// "abc", "3" — leaves every event in place. The 30-day floor exists so a
// typo (3 instead of 365) can't silently wipe most of the history.

export const MIN_RETENTION_DAYS = 30
const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000
const DEFAULT_BATCH_SIZE = 5000

/** Days to keep events, or null when retention is disabled/invalid. */
export function parseRetentionDays(value: string | undefined): number | null {
  if (value === undefined) return null
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const days = Number(trimmed)
  return Number.isSafeInteger(days) && days >= MIN_RETENTION_DAYS ? days : null
}

/**
 * Deletes events older than `days` days, in batches so no single statement
 * holds a long write lock on a big table. Returns the total deleted. Only
 * ever touches `events` (its foreign keys point OUT to episodes/seasons,
 * nothing points at it), so there is nothing to cascade or orphan.
 */
export function pruneEvents(db: Database, days: number, batch: number = DEFAULT_BATCH_SIZE): number {
  const stmt = db.prepare(`
    DELETE FROM events WHERE id IN (
      SELECT id FROM events WHERE created_at < datetime('now', ?) LIMIT ?
    )
  `)
  let total = 0
  for (;;) {
    const { changes } = stmt.run(`-${days} days`, batch)
    total += changes
    if (changes < batch) return total
  }
}

interface RetentionLogger {
  info: (obj: object, msg: string) => void
  error: (obj: object, msg: string) => void
}

/**
 * What server.ts calls at startup. Returns null — registering no timer and
 * deleting nothing — unless `envValue` is a valid retention setting. When
 * enabled it prunes once immediately, then every 24 hours on an unref()'d
 * timer (so it can never keep the process alive). A failing prune is logged
 * and never thrown: a retention hiccup must not take the server down.
 */
export function scheduleEventsRetention(
  db: Database,
  envValue: string | undefined,
  log: RetentionLogger,
): NodeJS.Timeout | null {
  const days = parseRetentionDays(envValue)
  if (days === null) return null

  const run = () => {
    try {
      const deleted = pruneEvents(db, days)
      log.info({ event: 'events_retention', deleted, days }, `events retention: deleted ${deleted} events older than ${days} days`)
    } catch (err) {
      log.error({ event: 'events_retention_failed', err }, 'events retention failed')
    }
  }

  run()
  const timer = setInterval(run, RETENTION_INTERVAL_MS)
  timer.unref()
  return timer
}
