import type { FastifyPluginAsync } from 'fastify'
import type { Settings } from '../types.js'

export const settingsRoute: FastifyPluginAsync = async (app) => {
  app.get('/settings', async (_request, reply) => {
    const row = app.db.prepare('SELECT * FROM settings').get() as Settings | undefined
    if (!row) return reply.status(500).send({ error: 'Settings not initialized' })
    return row
  })
}
