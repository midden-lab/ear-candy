import type { FastifyPluginAsync } from 'fastify'
import type { Settings } from '../../types.js'
import { requireAdmin } from '../../auth.js'

export const adminSettingsRoute: FastifyPluginAsync = async (app) => {
  app.put<{
    Body: Settings
  }>('/admin/settings', { preHandler: requireAdmin }, async (req, _reply) => {
    const { podcast_name, tagline, description, cover_art_path, accent_color } = req.body

    app.db.prepare('DELETE FROM settings').run()
    app.db.prepare(
      'INSERT INTO settings (podcast_name, tagline, description, cover_art_path, accent_color) VALUES (?, ?, ?, ?, ?)'
    ).run(podcast_name, tagline, description, cover_art_path ?? null, accent_color)

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

    const setClauses = fields.map(f => `${f} = ?`)
    const values: unknown[] = fields.map(f => {
      const v = updates[f]
      return v === undefined ? null : v
    })

    app.db.prepare(`UPDATE settings SET ${setClauses.join(', ')}`).run(...values)

    const row = app.db.prepare('SELECT * FROM settings').get() as Settings
    return row
  })
}
