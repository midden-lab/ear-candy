import { describe, it, expect } from 'vitest'
import { buildTestApp } from './helpers.js'

describe('GET /api/seasons', () => {
  it('returns only visible seasons ordered by number', async () => {
    const app = buildTestApp()
    app.db.prepare(`INSERT INTO seasons (number, title, hidden) VALUES (1,'Season 1',0)`).run()
    app.db.prepare(`INSERT INTO seasons (number, title, hidden) VALUES (2,'Season 2',1)`).run()
    app.db.prepare(`INSERT INTO seasons (number, title, hidden) VALUES (3,'Season 3',0)`).run()

    const res = await app.inject({ method: 'GET', url: '/api/seasons' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveLength(2)
    expect(body[0].number).toBe(1)
    expect(body[1].number).toBe(3)
  })
})
