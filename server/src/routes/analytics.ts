import type { FastifyPluginAsync } from 'fastify'
import type { AnalyticsEventType } from '../types.js'
import { isKnownCrawler } from '../utils/crawler.js'
import { resolveCountry } from '../utils/geoip.js'
import { parseUserAgent } from '../utils/userAgent.js'

const ALLOWED_EVENT_TYPES = new Set<string>(['page_view', 'play_start', 'listen_progress', 'play_complete'])
const ALLOWED_POSITION_PCTS = new Set([25, 50, 75, 90])
const DEDUP_WINDOW_SECONDS = 5
const MAX_SESSION_ID_LENGTH = 128
const MAX_REFERRER_LENGTH = 500

interface AnalyticsEventBody {
  event_type: AnalyticsEventType
  episode_id?: number
  season_id?: number
  session_id: string
  position_pct?: 25 | 50 | 75 | 90
  referrer?: string
}

// Hand-validated (matching this codebase's existing convention — see e.g.
// admin/seasons.ts — rather than a JSON-schema library). This is the first
// public, unauthenticated *write* route in the app, so shape validation
// here is a real defense layer, not just a nicety: it's the first of
// several (see the handler below) that keep an anonymous flood cheap to
// reject and pointless to bother with. A shape violation is allowed to
// return 400 (unlike everything after this point, which always returns
// 204 regardless of outcome) because it reveals nothing about episode/
// season validity — only that the payload itself was malformed.
function isValidBody(body: unknown): body is AnalyticsEventBody {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>

  if (typeof b.event_type !== 'string' || !ALLOWED_EVENT_TYPES.has(b.event_type)) return false
  if (typeof b.session_id !== 'string' || b.session_id.length === 0 || b.session_id.length > MAX_SESSION_ID_LENGTH) return false
  if (b.episode_id !== undefined && (typeof b.episode_id !== 'number' || !Number.isInteger(b.episode_id))) return false
  if (b.season_id !== undefined && (typeof b.season_id !== 'number' || !Number.isInteger(b.season_id))) return false
  if (b.position_pct !== undefined && !ALLOWED_POSITION_PCTS.has(b.position_pct as number)) return false
  if (b.referrer !== undefined && (typeof b.referrer !== 'string' || b.referrer.length > MAX_REFERRER_LENGTH)) return false

  return true
}

export const analyticsRoute: FastifyPluginAsync = async (app) => {
  app.post<{ Body: AnalyticsEventBody }>('/analytics/event', {
    // Small payload cap — this body is a handful of short fields, far
    // smaller than the 500MB default used for audio uploads elsewhere.
    bodyLimit: 4096,
    // A dedicated, tighter-than-global limit: the app-wide rate limit
    // (see app.ts) is explicitly sized as a generous backstop for cheap
    // reads, not a write endpoint. 120/min/IP stays comfortably above
    // realistic legitimate traffic (an active browsing session generates
    // at most a few dozen events) while bounding worst-case DB write
    // amplification from a scripted flood.
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    if (!isValidBody(req.body)) {
      return reply.status(400).send({ error: 'Invalid event payload' })
    }

    const { event_type, session_id, position_pct, referrer } = req.body
    let episodeId = req.body.episode_id
    let seasonId = req.body.season_id

    // From here on, every branch responds 204 regardless of what it
    // decided to do (drop silently vs. insert) — the response must never
    // let a caller distinguish "your episode_id was valid" from "it
    // wasn't," or this endpoint becomes a way to enumerate hidden/
    // nonexistent episode ids.
    const settingsRow = app.db.prepare('SELECT analytics_enabled FROM settings').get() as { analytics_enabled: number } | undefined
    if (!settingsRow?.analytics_enabled) {
      return reply.status(204).send()
    }

    if (isKnownCrawler(req.headers['user-agent'])) {
      return reply.status(204).send()
    }

    // A stale client (episode/season deleted after the page loaded) or an
    // arbitrary probed id both land here — null the reference out and
    // keep going, never reject, so the response shape stays uniform.
    if (episodeId !== undefined && !app.db.prepare('SELECT id FROM episodes WHERE id = ?').get(episodeId)) {
      episodeId = undefined
    }
    if (seasonId !== undefined && !app.db.prepare('SELECT id FROM seasons WHERE id = ?').get(seasonId)) {
      seasonId = undefined
    }

    // Duplicate-debounce: not a security control, just data hygiene — a
    // buggy client double-firing (React effect double-invocation, a
    // duplicate beacon send) shouldn't inflate counts.
    const duplicate = app.db.prepare(`
      SELECT 1 FROM events
      WHERE session_id = ? AND event_type = ? AND episode_id IS ?
        AND created_at > datetime('now', ?)
      LIMIT 1
    `).get(session_id, event_type, episodeId ?? null, `-${DEDUP_WINDOW_SECONDS} seconds`)
    if (duplicate) {
      return reply.status(204).send()
    }

    const country = await resolveCountry(req.ip)
    const { deviceType, os, browser } = parseUserAgent(req.headers['user-agent'])

    app.db.prepare(`
      INSERT INTO events (event_type, episode_id, season_id, session_id, position_pct, referrer, country, device_type, os, browser)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event_type,
      episodeId ?? null,
      seasonId ?? null,
      session_id,
      position_pct ?? null,
      referrer ?? null,
      country,
      deviceType,
      os,
      browser
    )

    return reply.status(204).send()
  })
}
