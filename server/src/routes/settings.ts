import type { FastifyPluginAsync } from 'fastify'
import type { Settings } from '../types.js'

export const settingsRoute: FastifyPluginAsync = async (app) => {
  app.get('/settings', async (_request, reply) => {
    // Explicit column list, not `SELECT *` — settings.session_epoch is an
    // internal auth-revocation counter (issue #34), not something an
    // unauthenticated public endpoint should ever expose.
    const row = app.db.prepare(`
      SELECT podcast_name, tagline, description, cover_art_path, favicon_path,
             browser_tab_title, accent_color, analytics_enabled, track_returning_listeners
      FROM settings
    `).get() as Settings | undefined
    if (!row) return reply.status(500).send({ error: 'Settings not initialized' })
    return row
  })
}
