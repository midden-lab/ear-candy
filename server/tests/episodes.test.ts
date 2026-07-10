import { describe, it, expect } from 'vitest'
import { buildTestApp } from './helpers.js'

function seedEpisodes(app: ReturnType<typeof buildTestApp>) {
  const s = app.db.prepare(`INSERT INTO seasons (number, title) VALUES (1,'S1')`).run()
  app.db.prepare(`
    INSERT INTO episodes (season_id,number,title,publish_date,audio_type,audio_path,hidden)
    VALUES (?,1,'Ep One','2024-01-01','url','https://example.com/1.mp3',0)
  `).run(s.lastInsertRowid)
  app.db.prepare(`
    INSERT INTO episodes (season_id,number,title,publish_date,audio_type,audio_path,hidden)
    VALUES (?,2,'Ep Two','2024-02-01','url','https://example.com/2.mp3',1)
  `).run(s.lastInsertRowid)
  return { seasonId: s.lastInsertRowid }
}

describe('GET /api/episodes', () => {
  it('returns only visible episodes ordered by number ASC', async () => {
    const app = buildTestApp()
    const s = app.db.prepare(`INSERT INTO seasons (number, title) VALUES (1,'S')`).run()
    app.db.prepare(`INSERT INTO episodes (season_id,number,title,publish_date,audio_type,audio_path,hidden) VALUES (?,2,'Ep Two','2024-02-01','url','x',0)`).run(s.lastInsertRowid)
    app.db.prepare(`INSERT INTO episodes (season_id,number,title,publish_date,audio_type,audio_path,hidden) VALUES (?,1,'Ep One','2024-01-01','url','x',0)`).run(s.lastInsertRowid)
    app.db.prepare(`INSERT INTO episodes (season_id,number,title,publish_date,audio_type,audio_path,hidden) VALUES (?,3,'Ep Hidden','2024-03-01','url','x',1)`).run(s.lastInsertRowid)
    const res = await app.inject({ method: 'GET', url: '/api/episodes' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveLength(2)
    expect(body[0].number).toBe(1)
    expect(body[1].number).toBe(2)
  })

  it('filters by season_id', async () => {
    const app = buildTestApp()
    const s1 = app.db.prepare(`INSERT INTO seasons (number,title) VALUES (1,'S1')`).run()
    const s2 = app.db.prepare(`INSERT INTO seasons (number,title) VALUES (2,'S2')`).run()
    app.db.prepare(`INSERT INTO episodes (season_id,number,title,publish_date,audio_type,audio_path,hidden) VALUES (?,1,'A','2024-01-01','url','x',0)`).run(s1.lastInsertRowid)
    app.db.prepare(`INSERT INTO episodes (season_id,number,title,publish_date,audio_type,audio_path,hidden) VALUES (?,1,'B','2024-01-01','url','x',0)`).run(s2.lastInsertRowid)

    const res = await app.inject({ method: 'GET', url: `/api/episodes?season_id=${s1.lastInsertRowid}` })
    expect(res.json()).toHaveLength(1)
    expect(res.json()[0].title).toBe('A')
  })
})

describe('GET /api/episodes/:id', () => {
  it('returns a single visible episode', async () => {
    const app = buildTestApp()
    seedEpisodes(app)
    const ep = app.db.prepare('SELECT id FROM episodes WHERE title=?').get('Ep One') as { id: number }
    const res = await app.inject({ method: 'GET', url: `/api/episodes/${ep.id}` })
    expect(res.statusCode).toBe(200)
    expect(res.json().title).toBe('Ep One')
  })

  it('returns 404 for a hidden episode', async () => {
    const app = buildTestApp()
    seedEpisodes(app)
    const ep = app.db.prepare('SELECT id FROM episodes WHERE title=?').get('Ep Two') as { id: number }
    const res = await app.inject({ method: 'GET', url: `/api/episodes/${ep.id}` })
    expect(res.statusCode).toBe(404)
  })
})
