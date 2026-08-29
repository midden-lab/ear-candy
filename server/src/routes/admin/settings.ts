import type { FastifyPluginAsync } from 'fastify'
import type { Settings } from '../../types.js'
import { requireAdmin } from '../../auth.js'
import { isValidMediaPath } from '../../utils/validation.js'

const ALLOWED_SETTINGS_PATCH_FIELDS = new Set(['podcast_name', 'tagline', 'description', 'cover_art_path', 'favicon_path', 'browser_tab_title', 'accent_color', 'analytics_enabled', 'track_returning_listeners'])

export const adminSettingsRoute: FastifyPluginAsync = async (app) => {
  app.put<{
    Body: Settings
  }>('/admin/settings', { preHandler: requireAdmin }, async (req, reply) => {
    const {
      podcast_name, tagline, description, cover_art_path, favicon_path, browser_tab_title, accent_color,
      analytics_enabled = true, track_returning_listeners = true,
    } = req.body
    if (!podcast_name.trim()) return reply.status(400).send({ error: 'podcast_name is required' })
    if (cover_art_path && !isValidMediaPath(cover_art_path)) {
      return reply.status(400).send({ error: 'Invalid cover_art_path' })
    }
    if (favicon_path && !isValidMediaPath(favicon_path)) {
      return reply.status(400).send({ error: 'Invalid favicon_path' })
    }

    app.db.prepare('DELETE FROM settings').run()
    app.db.prepare(
      'INSERT INTO settings (podcast_name, tagline, description, cover_art_path, favicon_path, browser_tab_title, accent_color, analytics_enabled, track_returning_listeners) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(podcast_name, tagline, description, cover_art_path ?? null, favicon_path ?? null, browser_tab_title ?? null, accent_color, analytics_enabled ? 1 : 0, track_returning_listeners ? 1 : 0)

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
}
