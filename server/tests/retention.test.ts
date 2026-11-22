import { describe, it, expect, afterEach, vi } from 'vitest'
import { buildTestApp } from './helpers.js'
import { parseRetentionDays, pruneEvents, scheduleEventsRetention } from '../src/utils/retention.js'

// Security audit M5 / issue #102 (plan 020 step 9): the events table had no
// retention at all. Retention is OPT-IN: nothing is ever deleted unless
// EVENTS_RETENTION_DAYS is set to an integer >= 30. It deletes analytics
// history permanently, so the default is "never" and a typo like 3 must not
// be able to wipe most of it.

type App = ReturnType<typeof buildTestApp>

function insertEvent(app: App, ageDays: number, session = 's') {
  app.db.prepare(
    "INSERT INTO events (event_type, session_id, created_at) VALUES ('page_view', ?, datetime('now', ?))"
  ).run(session, `-${ageDays} days`)
}
const countEvents = (app: App) => (app.db.prepare('SELECT COUNT(*) AS c FROM events').get() as { c: number }).c
const quietLog = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

describe('parseRetentionDays', () => {
  it('returns null for unset, empty, blank, non-integer and too-small values (retention stays OFF)', () => {
    for (const v of [undefined, '', '   ', 'abc', '7', '29', '0', '1.5', '-90', '90abc', '0x5A', '9e1', 'null']) {
      expect(parseRetentionDays(v), String(v)).toBeNull()
    }
  })

  it('returns the number of days for an integer >= 30', () => {
    expect(parseRetentionDays('30')).toBe(30)
    expect(parseRetentionDays('90')).toBe(90)
    expect(parseRetentionDays('365')).toBe(365)
    expect(parseRetentionDays(' 90 ')).toBe(90)
  })
})

describe('pruneEvents', () => {
  it('deletes only events older than the cutoff and keeps newer ones, returning how many it deleted', () => {
    const app = buildTestApp()
    insertEvent(app, 200); insertEvent(app, 100); insertEvent(app, 91) // older than 90 days
    insertEvent(app, 89); insertEvent(app, 10); insertEvent(app, 0)    // within 90 days

    const deleted = pruneEvents(app.db, 90)

    expect(deleted).toBe(3)
    expect(countEvents(app)).toBe(3)
    const oldest = app.db.prepare("SELECT MIN(created_at) AS m FROM events").get() as { m: string }
    const cutoff = app.db.prepare("SELECT datetime('now', '-90 days') AS c").get() as { c: string }
    expect(oldest.m > cutoff.c).toBe(true)
  })

  it('works through batches: more old rows than one batch are all removed and all counted', () => {
    const app = buildTestApp()
    for (let i = 0; i < 25; i++) insertEvent(app, 120, `old-${i}`)
    for (let i = 0; i < 4; i++) insertEvent(app, 1, `new-${i}`)

    expect(pruneEvents(app.db, 90, 10)).toBe(25)
    expect(countEvents(app)).toBe(4)
  })

  it('does nothing and returns 0 when nothing is old enough', () => {
    const app = buildTestApp()
    insertEvent(app, 5)
    expect(pruneEvents(app.db, 90)).toBe(0)
    expect(countEvents(app)).toBe(1)
  })

  it('touches only the events table: no FK errors, and seasons/episodes/settings are untouched', () => {
    const app = buildTestApp()
    const s = app.db.prepare("INSERT INTO seasons (number, title) VALUES (1, 'S1')").run()
    const e = app.db.prepare(
      "INSERT INTO episodes (season_id, number, title, publish_date, audio_type, audio_path) VALUES (?, 1, 'E', '2024-01-01', 'url', 'https://example.com/a.mp3')"
    ).run(s.lastInsertRowid)
    app.db.prepare(
      "INSERT INTO events (event_type, episode_id, season_id, session_id, created_at) VALUES ('play_start', ?, ?, 'x', datetime('now', '-400 days'))"
    ).run(e.lastInsertRowid, s.lastInsertRowid)

    expect(() => pruneEvents(app.db, 90)).not.toThrow()

    const n = (t: string) => (app.db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c
    expect([n('events'), n('episodes'), n('seasons'), n('settings')]).toEqual([0, 1, 1, 1])
  })
})

describe('scheduleEventsRetention (what server.ts calls)', () => {
  afterEach(() => { vi.useRealTimers() })

  it('with the env var unset/empty/invalid/too small: registers NO timer and deletes NOTHING', () => {
    vi.useFakeTimers()
    const app = buildTestApp()
    insertEvent(app, 500)
    for (const v of [undefined, '', 'abc', '7', '29']) {
      const log = quietLog()
      expect(scheduleEventsRetention(app.db, v, log), String(v)).toBeNull()
      expect(log.info).not.toHaveBeenCalled()
    }
    expect(vi.getTimerCount()).toBe(0)
    expect(countEvents(app)).toBe(1)
  })

  it('when enabled: prunes once immediately, logs the count, then again every 24h, on an unref\'d timer', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const app = buildTestApp()
    insertEvent(app, 200); insertEvent(app, 2)
    const log = quietLog()

    const timer = scheduleEventsRetention(app.db, '90', log)

    expect(timer).not.toBeNull()
    expect(timer!.hasRef()).toBe(false) // must never keep the process alive
    expect(countEvents(app)).toBe(1) // ran once at "boot"
    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ event: 'events_retention', deleted: 1, days: 90 }), expect.any(String))
    expect(vi.getTimerCount()).toBe(1)

    insertEvent(app, 300) // becomes eligible after boot
    vi.advanceTimersByTime(23 * 60 * 60 * 1000)
    expect(countEvents(app)).toBe(2) // not yet
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(countEvents(app)).toBe(1) // the 24h tick pruned it

    clearInterval(timer!)
  })

  it('never lets a failing prune crash the server: logs the error and keeps the schedule', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const log = quietLog()
    const brokenDb = { prepare: () => { throw new Error('database is locked') } } as unknown as App['db']

    let timer: ReturnType<typeof scheduleEventsRetention> = null
    expect(() => { timer = scheduleEventsRetention(brokenDb, '90', log) }).not.toThrow()

    expect(timer).not.toBeNull()
    expect(log.error).toHaveBeenCalled()
    clearInterval(timer!)
  })
})
