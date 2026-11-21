import type { FastifyPluginAsync } from 'fastify'
import type { Episode } from '../../types.js'
import { requireAdmin } from '../../auth.js'
import {
  isValidMediaPath, isNonEmptyString, isStringWithin, isIntegerInRange, firstInvalid,
  MAX_TITLE_LENGTH, MAX_TEXT_LENGTH, MAX_DATE_LENGTH, MIN_NUMBER, MAX_NUMBER,
  type FieldCheck,
} from '../../utils/validation.js'
import { deleteLocalMediaFile } from '../../utils/mediaFiles.js'

const ALLOWED_EPISODE_PATCH_FIELDS = new Set([
  'season_id', 'number', 'title', 'description', 'guests', 'tags',
  'cover_art_path', 'cover_art_thumb_path', 'duration_seconds', 'publish_date',
  'audio_type', 'audio_path', 'hidden'
])

// Mirrors the ALLOWED_EVENT_TYPES pattern in routes/analytics.ts — without
// this, an invalid audio_type only surfaced via the DB's own
// CHECK(audio_type IN ('upload','url')) constraint, uncaught, as a raw 500
// with internal SQLite error text instead of a clean 400.
const ALLOWED_AUDIO_TYPES = new Set(['upload', 'url'])

// Shape/size validation shared by POST, PUT and PATCH (`partial`: only
// fields actually present are checked). Returns the first bad field's name,
// or null. Existing, more specific checks (negative duration, audio_type,
// media paths, season existence) still run afterwards and keep their
// messages. Unknown extra fields stay tolerated.
function invalidEpisodeField(b: Record<string, unknown>, partial: boolean): string | null {
  const checks: FieldCheck[] = []
  const want = (k: string) => !partial || b[k] !== undefined
  if (want('title')) checks.push(['title', isNonEmptyString(b.title, MAX_TITLE_LENGTH)])
  if (want('number')) checks.push(['number', isIntegerInRange(b.number, MIN_NUMBER, MAX_NUMBER)])
  if (want('season_id')) checks.push(['season_id', isIntegerInRange(b.season_id, MIN_NUMBER, MAX_NUMBER)])
  if (want('publish_date')) checks.push(['publish_date', isStringWithin(b.publish_date, MAX_DATE_LENGTH)])
  for (const k of ['description', 'guests', 'tags']) {
    if (b[k] !== undefined) checks.push([k, isStringWithin(b[k], MAX_TEXT_LENGTH)])
  }
  // Type only; a negative value keeps its own specific message below.
  if (b.duration_seconds !== undefined) {
    checks.push(['duration_seconds', typeof b.duration_seconds === 'number' && Number.isFinite(b.duration_seconds)])
  }
  return firstInvalid(checks)
}

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
      cover_art_thumb_path?: string | null
      duration_seconds?: number
      hidden?: boolean
    }
  }>('/admin/episodes', { preHandler: requireAdmin }, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    if (typeof body.title === 'string' && !body.title.trim()) return reply.status(400).send({ error: 'title is required' })
    const bad = invalidEpisodeField(body, false)
    if (bad) return reply.status(400).send({ error: `${bad} is invalid` })
    const {
      season_id, number, title, publish_date, audio_type, audio_path,
      description = '', guests = '', tags = '', cover_art_path = null,
      cover_art_thumb_path = null, duration_seconds = 0, hidden = false
    } = req.body

    if (!title.trim()) return reply.status(400).send({ error: 'title is required' })
    if (duration_seconds < 0) return reply.status(400).send({ error: 'duration_seconds must not be negative' })
    if (!ALLOWED_AUDIO_TYPES.has(audio_type)) return reply.status(400).send({ error: 'Invalid audio_type' })
    if (!isValidMediaPath(audio_path)) return reply.status(400).send({ error: 'Invalid audio_path' })
    if (cover_art_path && !isValidMediaPath(cover_art_path)) return reply.status(400).send({ error: 'Invalid cover_art_path' })
    if (cover_art_thumb_path && !isValidMediaPath(cover_art_thumb_path)) return reply.status(400).send({ error: 'Invalid cover_art_thumb_path' })
    const season = app.db.prepare('SELECT id FROM seasons WHERE id = ?').get(season_id)
    if (!season) return reply.status(400).send({ error: 'season_id does not reference an existing season' })

    const result = app.db.prepare(`
      INSERT INTO episodes
        (season_id, number, title, description, guests, tags, cover_art_path,
         cover_art_thumb_path, duration_seconds, publish_date, audio_type, audio_path, hidden)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(season_id, number, title, description, guests, tags, cover_art_path,
           cover_art_thumb_path, duration_seconds, publish_date, audio_type, audio_path, hidden ? 1 : 0)
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
      cover_art_thumb_path?: string | null
      duration_seconds?: number
      publish_date: string
      audio_type: 'upload' | 'url'
      audio_path: string
      hidden?: boolean
    }
  }>('/admin/episodes/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = parseInt(req.params.id, 10)
    const body = (req.body ?? {}) as Record<string, unknown>
    if (typeof body.title === 'string' && !body.title.trim()) return reply.status(400).send({ error: 'title is required' })
    const bad = invalidEpisodeField(body, false)
    if (bad) return reply.status(400).send({ error: `${bad} is invalid` })
    const {
      season_id, number, title, publish_date, audio_type, audio_path,
      description = '', guests = '', tags = '', cover_art_path = null,
      cover_art_thumb_path = null, duration_seconds = 0, hidden = false
    } = req.body

    if (!title.trim()) return reply.status(400).send({ error: 'title is required' })
    if (duration_seconds < 0) return reply.status(400).send({ error: 'duration_seconds must not be negative' })
    if (!ALLOWED_AUDIO_TYPES.has(audio_type)) return reply.status(400).send({ error: 'Invalid audio_type' })
    if (!isValidMediaPath(audio_path)) return reply.status(400).send({ error: 'Invalid audio_path' })
    if (cover_art_path && !isValidMediaPath(cover_art_path)) return reply.status(400).send({ error: 'Invalid cover_art_path' })
    if (cover_art_thumb_path && !isValidMediaPath(cover_art_thumb_path)) return reply.status(400).send({ error: 'Invalid cover_art_thumb_path' })
    const season = app.db.prepare('SELECT id FROM seasons WHERE id = ?').get(season_id)
    if (!season) return reply.status(400).send({ error: 'season_id does not reference an existing season' })

    app.db.prepare(`
      UPDATE episodes SET
        season_id = ?, number = ?, title = ?, description = ?, guests = ?, tags = ?,
        cover_art_path = ?, cover_art_thumb_path = ?, duration_seconds = ?, publish_date = ?,
        audio_type = ?, audio_path = ?, hidden = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(season_id, number, title, description, guests, tags, cover_art_path,
           cover_art_thumb_path, duration_seconds, publish_date, audio_type, audio_path, hidden ? 1 : 0, id)
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
      cover_art_thumb_path: string | null
      duration_seconds: number
      publish_date: string
      audio_type: 'upload' | 'url'
      audio_path: string
      hidden: boolean
    }>
  }>('/admin/episodes/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = parseInt(req.params.id, 10)
    const updates = req.body ?? {}
    const fields = Object.keys(updates) as Array<keyof typeof updates>

    const invalidFields = fields.filter(f => !ALLOWED_EPISODE_PATCH_FIELDS.has(f))
    if (invalidFields.length > 0) {
      return reply.status(400).send({ error: `Invalid field(s): ${invalidFields.join(', ')}` })
    }

    if (typeof updates.title === 'string' && !updates.title.trim()) {
      return reply.status(400).send({ error: 'title is required' })
    }
    const bad = invalidEpisodeField(updates as Record<string, unknown>, true)
    if (bad) return reply.status(400).send({ error: `${bad} is invalid` })
    if (updates.duration_seconds !== undefined && updates.duration_seconds < 0) {
      return reply.status(400).send({ error: 'duration_seconds must not be negative' })
    }
    if (updates.audio_type !== undefined && !ALLOWED_AUDIO_TYPES.has(updates.audio_type)) {
      return reply.status(400).send({ error: 'Invalid audio_type' })
    }
    if (updates.audio_path !== undefined && !isValidMediaPath(updates.audio_path)) {
      return reply.status(400).send({ error: 'Invalid audio_path' })
    }
    if (updates.cover_art_path && !isValidMediaPath(updates.cover_art_path)) {
      return reply.status(400).send({ error: 'Invalid cover_art_path' })
    }
    if (updates.cover_art_thumb_path && !isValidMediaPath(updates.cover_art_thumb_path)) {
      return reply.status(400).send({ error: 'Invalid cover_art_thumb_path' })
    }
    if (updates.season_id !== undefined) {
      const season = app.db.prepare('SELECT id FROM seasons WHERE id = ?').get(updates.season_id)
      if (!season) return reply.status(400).send({ error: 'season_id does not reference an existing season' })
    }

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
    const existing = app.db.prepare('SELECT * FROM episodes WHERE id = ?').get(id) as Episode | undefined
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    app.db.prepare('DELETE FROM episodes WHERE id = ?').run(id)
    // Best-effort — the DB row is already gone either way (issue #4).
    await Promise.all([
      deleteLocalMediaFile(existing.audio_path),
      deleteLocalMediaFile(existing.cover_art_path),
      deleteLocalMediaFile(existing.cover_art_thumb_path),
    ])
    return reply.status(204).send()
  })
}
