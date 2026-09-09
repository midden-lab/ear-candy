import type { FastifyPluginAsync } from 'fastify'
import type { Settings } from '../../types.js'
import { requireAdmin } from '../../auth.js'
import { isValidMediaPath } from '../../utils/validation.js'
import { normalizeIp } from '../../utils/ipMatch.js'

const ALLOWED_SETTINGS_PATCH_FIELDS = new Set(['podcast_name', 'tagline', 'description', 'cover_art_path', 'favicon_path', 'browser_tab_title', 'accent_color', 'analytics_enabled', 'track_returning_listeners', 'excluded_analytics_ips'])
const MAX_EXCLUDED_IPS_LENGTH = 500

export const adminSettingsRoute: FastifyPluginAsync = async (app) => {
  // GET /api/settings (public.ts) deliberately excludes columns an
  // unauthenticated caller shouldn't see (session_epoch, and now
  // excluded_analytics_ips — the admin's own home/office IP). The admin
  // Settings page needs the *full* row, including those, to correctly
  // pre-fill its own form fields — this authenticated route is that source,
  // never the public one.
  app.get('/admin/settings', { preHandler: requireAdmin }, async () => {
    const row = app.db.prepare('SELECT * FROM settings').get() as Settings
    return row
  })

  app.put<{
    Body: Settings
  }>('/admin/settings', { preHandler: requireAdmin }, async (req, reply) => {
    const {
      podcast_name, tagline, description, cover_art_path, favicon_path, browser_tab_title, accent_color,
      analytics_enabled = true, track_returning_listeners = true, excluded_analytics_ips = null,
    } = req.body
    if (!podcast_name.trim()) return reply.status(400).send({ error: 'podcast_name is required' })
    if (cover_art_path && !isValidMediaPath(cover_art_path)) {
      return reply.status(400).send({ error: 'Invalid cover_art_path' })
    }
    if (favicon_path && !isValidMediaPath(favicon_path)) {
      return reply.status(400).send({ error: 'Invalid favicon_path' })
    }
    if (typeof excluded_analytics_ips === 'string' && excluded_analytics_ips.length > MAX_EXCLUDED_IPS_LENGTH) {
      return reply.status(400).send({ error: 'excluded_analytics_ips is too long' })
    }

    app.db.prepare('DELETE FROM settings').run()
    app.db.prepare(
      'INSERT INTO settings (podcast_name, tagline, description, cover_art_path, favicon_path, browser_tab_title, accent_color, analytics_enabled, track_returning_listeners, excluded_analytics_ips) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(podcast_name, tagline, description, cover_art_path ?? null, favicon_path ?? null, browser_tab_title ?? null, accent_color, analytics_enabled ? 1 : 0, track_returning_listeners ? 1 : 0, excluded_analytics_ips ?? null)

    const row = app.db.prepare('SELECT * FROM settings').get() as Settings
    return row
  })

  app.patch<{
    Body: Partial<Settings>
  }>('/admin/settings', { preHandler: requireAdmin }, async (req, reply) => {
    const updates = req.body
    const fields = Object.keys(updates) as Array<keyof Settings>

    if (fields.length === 0) {
      return reply.status(400).send({ error: 'No fields to update' })
    }

    const invalidFields = fields.filter(f => !ALLOWED_SETTINGS_PATCH_FIELDS.has(f))
    if (invalidFields.length > 0) {
      return reply.status(400).send({ error: `Invalid field(s): ${invalidFields.join(', ')}` })
    }
    if (updates.podcast_name !== undefined && !updates.podcast_name.trim()) {
      return reply.status(400).send({ error: 'podcast_name is required' })
    }
    if (updates.cover_art_path && !isValidMediaPath(updates.cover_art_path)) {
      return reply.status(400).send({ error: 'Invalid cover_art_path' })
    }
    if (updates.favicon_path && !isValidMediaPath(updates.favicon_path)) {
      return reply.status(400).send({ error: 'Invalid favicon_path' })
    }
    if (typeof updates.excluded_analytics_ips === 'string' && updates.excluded_analytics_ips.length > MAX_EXCLUDED_IPS_LENGTH) {
      return reply.status(400).send({ error: 'excluded_analytics_ips is too long' })
    }

    const setClauses = fields.map(f => `${f} = ?`)
    const values: unknown[] = fields.map(f => {
      const v = updates[f]
      if (f === 'analytics_enabled' || f === 'track_returning_listeners') return v ? 1 : 0
      return v === undefined ? null : v
    })

    app.db.prepare(`UPDATE settings SET ${setClauses.join(', ')}`).run(...values)

    const row = app.db.prepare('SELECT * FROM settings').get() as Settings
    return row
  })

  // Powers the "Add my current IP" button in Admin Settings — returns the
  // normalized form (not raw req.ip) so what the admin sees and saves is
  // exactly the string isExcludedIp() will later compare against.
  app.get('/admin/my-ip', { preHandler: requireAdmin }, async (req) => {
    return { ip: normalizeIp(req.ip) }
  })
}
