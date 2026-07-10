import type { FastifyPluginAsync } from 'fastify'
import type { Season } from '../../types.js'
import { requireAdmin } from '../../auth.js'

export const adminSeasonsRoute: FastifyPluginAsync = async (app) => {
  app.post<{
    Body: {
      number: number
      title: string
      description?: string
      hidden?: boolean
    }
  }>('/admin/seasons', { preHandler: requireAdmin }, async (req, reply) => {
    const { number, title, description = '', hidden = false } = req.body
    const result = app.db.prepare(`
      INSERT INTO seasons (number, title, description, hidden)
      VALUES (?, ?, ?, ?)
    `).run(number, title, description, hidden ? 1 : 0)
    const row = app.db.prepare('SELECT * FROM seasons WHERE id = ?').get(result.lastInsertRowid) as Season
    return reply.status(201).send(row)
  })

  app.put<{
    Params: { id: string }
    Body: {
      number: number
      title: string
      description?: string
      cover_art_path?: string | null
      hidden?: boolean
    }
  }>('/admin/seasons/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = parseInt(req.params.id, 10)
    const { number, title, description = '', cover_art_path = null, hidden = false } = req.body
    app.db.prepare(`
      UPDATE seasons SET number = ?, title = ?, description = ?, cover_art_path = ?, hidden = ?
      WHERE id = ?
    `).run(number, title, description, cover_art_path, hidden ? 1 : 0, id)
    const row = app.db.prepare('SELECT * FROM seasons WHERE id = ?').get(id) as Season | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    return row
  })

  app.patch<{
    Params: { id: string }
    Body: Partial<{
      number: number
      title: string
      description: string
      cover_art_path: string | null
      hidden: boolean
    }>
  }>('/admin/seasons/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = parseInt(req.params.id, 10)
    const updates = req.body
    const fields = Object.keys(updates) as Array<keyof typeof updates>

    if (fields.length === 0) {
      const row = app.db.prepare('SELECT * FROM seasons WHERE id = ?').get(id) as Season | undefined
      if (!row) return reply.status(404).send({ error: 'Not found' })
      return row
    }

    const setClauses = fields.map(f => `${f} = ?`).join(', ')
    const values = fields.map(f => {
      const v = updates[f]
      if (f === 'hidden') return v ? 1 : 0
      return v
    })
    values.push(id)

    app.db.prepare(`UPDATE seasons SET ${setClauses} WHERE id = ?`).run(...values)
    const row = app.db.prepare('SELECT * FROM seasons WHERE id = ?').get(id) as Season | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    return row
  })

  app.delete<{ Params: { id: string } }>('/admin/seasons/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = parseInt(req.params.id, 10)
    const existing = app.db.prepare('SELECT id FROM seasons WHERE id = ?').get(id)
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    app.db.prepare('DELETE FROM seasons WHERE id = ?').run(id)
    return reply.status(204).send()
  })
}
