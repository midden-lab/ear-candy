import type { FastifyPluginAsync } from 'fastify'
import type { Episode } from '../types.js'

export const episodesRoute: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { season_id?: string } }>('/episodes', async (req, reply) => {
    const { season_id } = req.query
    const base = `
      SELECT e.* FROM episodes e
      JOIN seasons s ON s.id = e.season_id
      WHERE e.hidden=0 AND s.hidden=0
    `
    if (season_id !== undefined) {
      const id = parseInt(season_id, 10)
      if (isNaN(id)) return reply.status(400).send({ error: 'season_id must be an integer' })
      return app.db.prepare(base + ' AND e.season_id=? ORDER BY e.number ASC').all(id) as Episode[]
    }
    return app.db.prepare(base + ' ORDER BY e.number ASC').all() as Episode[]
  })

  app.get<{ Params: { id: string } }>('/episodes/:id', async (req, reply) => {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return reply.status(400).send({ error: 'id must be an integer' })
    const ep = app.db.prepare(`
      SELECT e.* FROM episodes e
      JOIN seasons s ON s.id=e.season_id
      WHERE e.id=? AND e.hidden=0 AND s.hidden=0
    `).get(id) as Episode | undefined
    if (!ep) return reply.status(404).send({ error: 'Not found' })
    return ep
  })
}
