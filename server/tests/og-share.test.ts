import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import type { FastifyInstance } from 'fastify'

describe('shared-episode OG tags for known crawlers', () => {
  let app: FastifyInstance
  let tmpDir: string
  let episodeId: number

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ear-candy-test-'))
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html><body>SPA</body></html>')
    app = buildApp({ dbPath: ':memory:', logger: false, clientDistPath: tmpDir })
    await app.ready()

    app.db.prepare(`UPDATE settings SET podcast_name = 'My Podcast'`).run()
    const season = app.db.prepare(`INSERT INTO seasons (number, title) VALUES (1, 'Season One')`).run()
    const episode = app.db.prepare(`
      INSERT INTO episodes (season_id, number, title, description, publish_date, audio_type, audio_path, hidden)
      VALUES (?, 1, 'A Great Episode', 'All about testing', '2024-01-01', 'url', 'https://example.com/1.mp3', 0)
    `).run(season.lastInsertRowid)
    episodeId = Number(episode.lastInsertRowid)

    const hiddenEpisode = app.db.prepare(`
      INSERT INTO episodes (season_id, number, title, publish_date, audio_type, audio_path, hidden)
      VALUES (?, 2, 'Hidden Episode', '2024-01-02', 'url', 'https://example.com/2.mp3', 1)
    `).run(season.lastInsertRowid)
    ;(app as unknown as { hiddenEpisodeId: number }).hiddenEpisodeId = Number(hiddenEpisode.lastInsertRowid)
  })

  afterAll(async () => {
    fs.rmSync(tmpDir, { recursive: true })
    await app.close()
  })

  it('serves the normal SPA shell to a real browser, even with an episode param', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/?episode=${episodeId}`,
      headers: { 'user-agent': 'Mozilla/5.0 (real browser)' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('SPA')
    expect(res.body).not.toContain('og:title')
  })

  it('serves an OG-tagged HTML snippet to a known crawler with a valid episode param', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/?episode=${episodeId}&t=90`,
      headers: { 'user-agent': 'Twitterbot/1.0' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('<meta property="og:title" content="A Great Episode">')
    expect(res.body).toContain('<meta property="og:description" content="All about testing">')
    expect(res.body).toContain('<meta property="og:site_name" content="My Podcast">')
    expect(res.body).toContain(`episode=${episodeId}&amp;t=90`)
    expect(res.body).not.toContain('SPA')
  })

  it('recognizes other known crawler user agents (facebookexternalhit, Slackbot, Discordbot)', async () => {
    for (const ua of ['facebookexternalhit/1.1', 'Slackbot-LinkExpanding 1.0', 'Discordbot/2.0']) {
      const res = await app.inject({
        method: 'GET',
        url: `/?episode=${episodeId}`,
        headers: { 'user-agent': ua },
      })
      expect(res.body).toContain('og:title')
    }
  })

  it('falls back to the normal SPA shell for a crawler with no episode param', async () => {
    const res = await app.inject({ method: 'GET', url: '/', headers: { 'user-agent': 'Twitterbot/1.0' } })
    expect(res.body).toContain('SPA')
    expect(res.body).not.toContain('og:title')
  })

  it('falls back to the normal SPA shell for a crawler requesting a hidden episode', async () => {
    const hiddenId = (app as unknown as { hiddenEpisodeId: number }).hiddenEpisodeId
    const res = await app.inject({
      method: 'GET',
      url: `/?episode=${hiddenId}`,
      headers: { 'user-agent': 'Twitterbot/1.0' },
    })
    expect(res.body).toContain('SPA')
    expect(res.body).not.toContain('og:title')
  })

  it('falls back to the normal SPA shell for a crawler with a non-numeric episode param', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/?episode=not-a-number',
      headers: { 'user-agent': 'Twitterbot/1.0' },
    })
    expect(res.body).toContain('SPA')
  })

  it('escapes HTML in episode title/description to prevent injection into the OG snippet', async () => {
    const season = app.db.prepare(`INSERT INTO seasons (number, title) VALUES (2, 'Season Two')`).run()
    const evil = app.db.prepare(`
      INSERT INTO episodes (season_id, number, title, description, publish_date, audio_type, audio_path, hidden)
      VALUES (?, 1, '<script>alert(1)</script>', '"><img src=x>', '2024-01-01', 'url', 'https://example.com/3.mp3', 0)
    `).run(season.lastInsertRowid)

    const res = await app.inject({
      method: 'GET',
      url: `/?episode=${evil.lastInsertRowid}`,
      headers: { 'user-agent': 'Twitterbot/1.0' },
    })
    expect(res.body).not.toContain('<script>alert(1)</script>')
    expect(res.body).toContain('&lt;script&gt;')
  })

  it('resolves a relative cover_art_path to an absolute og:image URL', async () => {
    const season = app.db.prepare(`INSERT INTO seasons (number, title) VALUES (3, 'Season Three')`).run()
    const withArt = app.db.prepare(`
      INSERT INTO episodes (season_id, number, title, cover_art_path, publish_date, audio_type, audio_path, hidden)
      VALUES (?, 1, 'Episode With Art', '/images/abc-detail.webp', '2024-01-01', 'url', 'https://example.com/4.mp3', 0)
    `).run(season.lastInsertRowid)

    const res = await app.inject({
      method: 'GET',
      url: `/?episode=${withArt.lastInsertRowid}`,
      headers: { 'user-agent': 'Twitterbot/1.0', host: 'podcast.example.com' },
    })
    expect(res.body).toContain('<meta property="og:image" content="http://podcast.example.com/images/abc-detail.webp">')
  })

  it('leaves an already-absolute cover art URL untouched', async () => {
    const season = app.db.prepare(`INSERT INTO seasons (number, title) VALUES (4, 'Season Four')`).run()
    const withAbsoluteArt = app.db.prepare(`
      INSERT INTO episodes (season_id, number, title, cover_art_path, publish_date, audio_type, audio_path, hidden)
      VALUES (?, 1, 'Episode With Absolute Art', 'https://cdn.example.com/art.jpg', '2024-01-01', 'url', 'https://example.com/5.mp3', 0)
    `).run(season.lastInsertRowid)

    const res = await app.inject({
      method: 'GET',
      url: `/?episode=${withAbsoluteArt.lastInsertRowid}`,
      headers: { 'user-agent': 'Twitterbot/1.0' },
    })
    expect(res.body).toContain('<meta property="og:image" content="https://cdn.example.com/art.jpg">')
  })

  it('is scoped to exactly "/" and does not intercept a crawler-UA request to another route', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/episodes/${episodeId}`,
      headers: { 'user-agent': 'Twitterbot/1.0' },
    })
    expect(res.body).not.toContain('og:title')
    const body = res.json()
    expect(body.id).toBe(episodeId)
  })

  it('does not emit a meta-refresh redirect (issue #53 — was a Host-header-controlled open-redirect vector)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/?episode=${episodeId}`,
      headers: { 'user-agent': 'Twitterbot/1.0' },
    })
    expect(res.body).not.toContain('http-equiv="refresh"')
  })

  it('reflects an attacker-controlled Host header into og:url by default, but only as inert (escaped) metadata', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/?episode=${episodeId}`,
      headers: { 'user-agent': 'Twitterbot/1.0', host: 'evil.example.com' },
    })
    expect(res.body).toContain('<meta property="og:url" content="http://evil.example.com/')
    // No redirect-capable tag anywhere in the response — see the meta-refresh test above.
    expect(res.body).not.toContain('http-equiv="refresh"')
  })

  it('PUBLIC_ORIGIN, when set, overrides the request-derived origin entirely', async () => {
    const original = process.env.PUBLIC_ORIGIN
    process.env.PUBLIC_ORIGIN = 'https://podcast.example.org'
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/?episode=${episodeId}`,
        headers: { 'user-agent': 'Twitterbot/1.0', host: 'evil.example.com' },
      })
      expect(res.body).toContain('<meta property="og:url" content="https://podcast.example.org/')
      expect(res.body).not.toContain('evil.example.com')
    } finally {
      if (original === undefined) delete process.env.PUBLIC_ORIGIN
      else process.env.PUBLIC_ORIGIN = original
    }
  })

  it('a malformed PUBLIC_ORIGIN is ignored, falling back to the request-derived origin', async () => {
    const original = process.env.PUBLIC_ORIGIN
    process.env.PUBLIC_ORIGIN = 'not-a-valid-origin'
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/?episode=${episodeId}`,
        headers: { 'user-agent': 'Twitterbot/1.0', host: 'podcast.example.com' },
      })
      expect(res.body).toContain('<meta property="og:url" content="http://podcast.example.com/')
    } finally {
      if (original === undefined) delete process.env.PUBLIC_ORIGIN
      else process.env.PUBLIC_ORIGIN = original
    }
  })
})
