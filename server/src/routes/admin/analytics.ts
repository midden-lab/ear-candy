import type { FastifyPluginAsync, FastifyInstance } from 'fastify'
import type { AnalyticsOverview, AnalyticsEpisodeStat, AnalyticsBreakdowns } from '../../types.js'
import { requireAdmin } from '../../auth.js'

const DEFAULT_DAYS = 30

function parseDays(daysParam: string | undefined): number | null {
  const days = daysParam === undefined ? DEFAULT_DAYS : parseInt(daysParam, 10)
  if (!Number.isFinite(days) || days <= 0) return null
  return days
}

function windowStart(app: FastifyInstance, days: number): string {
  return (app.db.prepare("SELECT datetime('now', ?) as ws").get(`-${days} days`) as { ws: string }).ws
}

// One breakdown = "how many page_view events had this column set to each
// distinct value, within the window." Scoped to page_view only (not every
// event type) so a single visit that also plays several episodes doesn't
// get counted multiple times toward the same audience-shape breakdown.
// `column` is always one of this file's own hardcoded literals below —
// never derived from request input — so string-interpolating it into the
// query is safe despite not being a bound parameter.
function breakdownFor(app: FastifyInstance, column: string, ws: string): { key: string; count: number }[] {
  return app.db.prepare(`
    SELECT ${column} as key, COUNT(*) as count
    FROM events
    WHERE event_type = 'page_view' AND created_at >= ? AND ${column} IS NOT NULL
    GROUP BY ${column}
    ORDER BY count DESC
  `).all(ws) as { key: string; count: number }[]
}

export const adminAnalyticsRoute: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { days?: string } }>('/admin/analytics/overview', { preHandler: requireAdmin }, async (req, reply) => {
    const days = parseDays(req.query.days)
    if (days === null) return reply.status(400).send({ error: 'Invalid days parameter' })
    const ws = windowStart(app, days)

    const totals = app.db.prepare(`
      SELECT
        SUM(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) as totalPageViews,
        SUM(CASE WHEN event_type = 'play_start' THEN 1 ELSE 0 END) as totalPlayStarts,
        SUM(CASE WHEN event_type = 'play_complete' THEN 1 ELSE 0 END) as totalPlayCompletes,
        COUNT(DISTINCT session_id) as uniqueSessions
      FROM events
      WHERE created_at >= ?
    `).get(ws) as { totalPageViews: number | null; totalPlayStarts: number | null; totalPlayCompletes: number | null; uniqueSessions: number }

    // A session in the window counts as "returning" if it has any event
    // from before the window started (its all-time first event predates
    // the window), "new" otherwise. No explicit "already seen" flag is
    // needed — this is derived purely from the events table itself.
    const sessionSplit = app.db.prepare(`
      SELECT
        SUM(CASE WHEN first_seen < ? THEN 1 ELSE 0 END) as returningSessions,
        SUM(CASE WHEN first_seen >= ? THEN 1 ELSE 0 END) as newSessions
      FROM (
        SELECT session_id, MIN(created_at) as first_seen
        FROM events
        WHERE session_id IN (SELECT DISTINCT session_id FROM events WHERE created_at >= ?)
        GROUP BY session_id
      )
    `).get(ws, ws, ws) as { returningSessions: number | null; newSessions: number | null }

    const timeseries = app.db.prepare(`
      SELECT
        date(created_at) as date,
        SUM(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) as page_views,
        SUM(CASE WHEN event_type = 'play_start' THEN 1 ELSE 0 END) as play_starts
      FROM events
      WHERE created_at >= ?
      GROUP BY date(created_at)
      ORDER BY date ASC
    `).all(ws) as { date: string; page_views: number; play_starts: number }[]

    const overview: AnalyticsOverview = {
      totalPageViews: totals.totalPageViews ?? 0,
      totalPlayStarts: totals.totalPlayStarts ?? 0,
      totalPlayCompletes: totals.totalPlayCompletes ?? 0,
      uniqueSessions: totals.uniqueSessions,
      newSessions: sessionSplit.newSessions ?? 0,
      returningSessions: sessionSplit.returningSessions ?? 0,
      timeseries,
    }
    return overview
  })

  app.get('/admin/analytics/episodes', { preHandler: requireAdmin }, async (_req, _reply) => {
    const rows = app.db.prepare(`
      SELECT
        e.episode_id as episode_id,
        ep.title as title,
        SUM(CASE WHEN e.event_type = 'play_start' THEN 1 ELSE 0 END) as play_starts,
        SUM(CASE WHEN e.event_type = 'play_complete' THEN 1 ELSE 0 END) as play_completes,
        SUM(CASE WHEN e.event_type = 'listen_progress' AND e.position_pct = 25 THEN 1 ELSE 0 END) as milestone_25,
        SUM(CASE WHEN e.event_type = 'listen_progress' AND e.position_pct = 50 THEN 1 ELSE 0 END) as milestone_50,
        SUM(CASE WHEN e.event_type = 'listen_progress' AND e.position_pct = 75 THEN 1 ELSE 0 END) as milestone_75,
        SUM(CASE WHEN e.event_type = 'listen_progress' AND e.position_pct = 90 THEN 1 ELSE 0 END) as milestone_90
      FROM events e
      JOIN episodes ep ON ep.id = e.episode_id
      WHERE e.episode_id IS NOT NULL
      GROUP BY e.episode_id, ep.title
      ORDER BY play_starts DESC
    `).all() as Omit<AnalyticsEpisodeStat, 'completion_rate'>[]

    const stats: AnalyticsEpisodeStat[] = rows.map(r => ({
      ...r,
      completion_rate: r.play_starts > 0 ? r.play_completes / r.play_starts : 0,
    }))
    return stats
  })

  app.get<{ Querystring: { days?: string } }>('/admin/analytics/breakdowns', { preHandler: requireAdmin }, async (req, reply) => {
    const days = parseDays(req.query.days)
    if (days === null) return reply.status(400).send({ error: 'Invalid days parameter' })
    const ws = windowStart(app, days)

    const breakdowns: AnalyticsBreakdowns = {
      countries: breakdownFor(app, 'country', ws),
      devices: breakdownFor(app, 'device_type', ws),
      browsers: breakdownFor(app, 'browser', ws),
      os: breakdownFor(app, 'os', ws),
      referrers: breakdownFor(app, 'referrer', ws),
    }
    return breakdowns
  })
}
