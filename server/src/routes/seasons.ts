import type { FastifyPluginAsync } from 'fastify'
import type { Season } from '../types.js'

export const seasonsRoute: FastifyPluginAsync = async (app) => {
  app.get('/seasons', async () => {
    return app.db.prepare('SELECT * FROM seasons WHERE hidden=0 ORDER BY number ASC').all() as Season[]
  })
}
