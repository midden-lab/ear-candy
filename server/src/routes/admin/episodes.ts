import type { FastifyPluginAsync } from 'fastify'
import type { Episode } from '../../types.js'
import { requireAdmin } from '../../auth.js'

export const adminEpisodesRoute: FastifyPluginAsync = async (app) => {
  app.post<{
    Body: {
      season_id: number
      number: number
      title: string
      publish_date: string
      audio_type: 'upload' | 'url'
      audio_path: string
      description?: string
      guests?: string
      tags?: string
      cover_art_path?: string | null
      duration_seconds?: number
      hidden?: boolean
    }
  }>('/admin/episodes', { preHandler: requireAdmin }, async (req, reply) => {
    const {
      season_id, number, title, publish_date, audio_type, audio_path,
      description = '', guests = '', tags = '', cover_art_path = null,
      duration_seconds = 0, hidden = false
    } = req.body
    const result = app.db.prepare(`
      INSERT INTO episodes
        (season_id, number, title, description, guests, tags, cover_art_path,
         duration_seconds, publish_date, audio_type, audio_path, hidden)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(season_id, number, title, description, guests, tags, cover_art_path,
           duration_seconds, publish_date, audio_type, audio_path, hidden ? 1 : 0)
    const row = app.db.prepare('SELECT * FROM episodes WHERE id = ?').get(result.lastInsertRowid) as Episode
    return reply.status(201).send(row)
  })

  app.put<{
    Params: { id: string }
    Body: {
      season_id: number
      number: number
      title: string
      description?: string
      guests?: string
      tags?: string
      cover_art_path?: string | null
      duration_seconds?: number
      publish_date: string
      audio_type: 'upload' | 'url'
      audio_path: string
      hidden?: boolean
    }
  }>('/admin/episodes/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = parseInt(req.params.id, 10)
    const {
      season_id, number, title, publish_date, audio_type, audio_path,
      description = '', guests = '', tags = '', cover_art_path = null,
      duration_seconds = 0, hidden = false
    } = req.body
    app.db.prepare(`
      UPDATE episodes SET
        season_id = ?, number = ?, title = ?, description = ?, guests = ?, tags = ?,
        cover_art_path = ?, duration_seconds = ?, publish_date = ?, audio_type = ?,
        audio_path = ?, hidden = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(season_id, number, title, description, guests, tags, cover_art_path,
           duration_seconds, publish_date, audio_type, audio_path, hidden ? 1 : 0, id)
    const row = app.db.prepare('SELECT * FROM episodes WHERE id = ?').get(id) as Episode | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    return row
  })

  app.patch<{
    Params: { id: string }
    Body: Partial<{
      season_id: number
      number: number
      title: string
      description: string
      guests: string
      tags: string
      cover_art_path: string | null
      duration_seconds: number
      publish_date: string
      audio_type: 'upload' | 'url'
      audio_path: string
      hidden: boolean
    }>
  }>('/admin/episodes/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = parseInt(req.params.id, 10)
    const updates = req.body
    const fields = Object.keys(updates) as Array<keyof typeof updates>

    const setClauses: string[] = fields.map(f => `${f} = ?`)
    const values: unknown[] = fields.map(f => {
      const v = updates[f]
      if (f === 'hidden') return v ? 1 : 0
      return v
    })

    // Always update updated_at for episodes
    setClauses.push(`updated_at = datetime('now')`)
    values.push(id)

    if (fields.length === 0) {
      // Still update updated_at
      app.db.prepare(`UPDATE episodes SET updated_at = datetime('now') WHERE id = ?`).run(id)
    } else {
      app.db.prepare(`UPDATE episodes SET ${setClauses.join(', ')} WHERE id = ?`).run(...values)
    }

    const row = app.db.prepare('SELECT * FROM episodes WHERE id = ?').get(id) as Episode | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    return row
  })

  app.delete<{ Params: { id: string } }>('/admin/episodes/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = parseInt(req.params.id, 10)
    const existing = app.db.prepare('SELECT id FROM episodes WHERE id = ?').get(id)
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    app.db.prepare('DELETE FROM episodes WHERE id = ?').run(id)
    return reply.status(204).send()
  })
}
