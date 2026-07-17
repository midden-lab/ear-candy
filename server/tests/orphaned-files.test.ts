import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import bcrypt from 'bcrypt'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { buildTestApp } from './helpers.js'
import type { FastifyInstance } from 'fastify'

describe('deleting orphaned uploaded files (issue #4)', () => {
  let app: FastifyInstance
  let tmpDir: string
  let originalCwd: string
  let cookieHeader: string

  beforeAll(async () => {
    originalCwd = process.cwd()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ear-candy-orphaned-'))
    process.chdir(tmpDir)

    process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash('password', 10)
    app = buildTestApp()
    await app.ready()

    const loginRes = await app.inject({ method: 'POST', url: '/api/admin/login', payload: { password: 'password' } })
    const setCookie = loginRes.headers['set-cookie'] as string | string[]
    cookieHeader = (Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0]
  })

  afterAll(async () => {
    await app.close()
    process.chdir(originalCwd)
    fs.rmSync(tmpDir, { recursive: true })
    delete process.env.ADMIN_PASSWORD_HASH
  })

  function writeUploadFile(relativeToUploads: string) {
    const full = path.join(tmpDir, 'data', 'uploads', relativeToUploads)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, 'fake file contents')
    return full
  }

  beforeEach(() => {
    fs.rmSync(path.join(tmpDir, 'data', 'uploads'), { recursive: true, force: true })
  })

  it('deletes the audio + cover art files when an episode is deleted', async () => {
    const audioFile = writeUploadFile('ep-audio.mp3')
    const coverFile = writeUploadFile('images/ep-cover-detail.webp')
    const thumbFile = writeUploadFile('images/ep-cover-thumb.webp')

    const season = await app.inject({
      method: 'POST', url: '/api/admin/seasons', headers: { cookie: cookieHeader },
      payload: { number: 1, title: 'S1' },
    }).then(r => r.json())

    const episode = await app.inject({
      method: 'POST', url: '/api/admin/episodes', headers: { cookie: cookieHeader },
      payload: {
        season_id: season.id, number: 1, title: 'Ep', publish_date: '2024-01-01',
        audio_type: 'upload', audio_path: '/audio/ep-audio.mp3',
        cover_art_path: '/images/ep-cover-detail.webp', cover_art_thumb_path: '/images/ep-cover-thumb.webp',
      },
    }).then(r => r.json())

    expect(fs.existsSync(audioFile)).toBe(true)

    const del = await app.inject({ method: 'DELETE', url: `/api/admin/episodes/${episode.id}`, headers: { cookie: cookieHeader } })
    expect(del.statusCode).toBe(204)

    expect(fs.existsSync(audioFile)).toBe(false)
    expect(fs.existsSync(coverFile)).toBe(false)
    expect(fs.existsSync(thumbFile)).toBe(false)
  })

  it('does not attempt to delete an external (http) audio URL', async () => {
    const season = await app.inject({
      method: 'POST', url: '/api/admin/seasons', headers: { cookie: cookieHeader },
      payload: { number: 2, title: 'S2' },
    }).then(r => r.json())

    const episode = await app.inject({
      method: 'POST', url: '/api/admin/episodes', headers: { cookie: cookieHeader },
      payload: {
        season_id: season.id, number: 1, title: 'Ep URL', publish_date: '2024-01-01',
        audio_type: 'url', audio_path: 'https://example.com/ep.mp3',
      },
    }).then(r => r.json())

    // Just confirming this doesn't throw/500 — there's no local file to
    // assert on, the whole point is deleteLocalMediaFile is a no-op here.
    const del = await app.inject({ method: 'DELETE', url: `/api/admin/episodes/${episode.id}`, headers: { cookie: cookieHeader } })
    expect(del.statusCode).toBe(204)
  })

  it('deletes the season cover art and every episode file when a season is deleted (before cascade wipes the rows)', async () => {
    const seasonCover = writeUploadFile('images/season-cover.webp')
    const ep1Audio = writeUploadFile('ep1.mp3')
    const ep2Audio = writeUploadFile('ep2.mp3')

    const season = await app.inject({
      method: 'POST', url: '/api/admin/seasons', headers: { cookie: cookieHeader },
      payload: { number: 3, title: 'S3' },
    }).then(r => r.json())

    await app.inject({
      method: 'PATCH', url: `/api/admin/seasons/${season.id}`, headers: { cookie: cookieHeader },
      payload: { cover_art_path: '/images/season-cover.webp' },
    })

    await app.inject({
      method: 'POST', url: '/api/admin/episodes', headers: { cookie: cookieHeader },
      payload: { season_id: season.id, number: 1, title: 'Ep1', publish_date: '2024-01-01', audio_type: 'upload', audio_path: '/audio/ep1.mp3' },
    })
    await app.inject({
      method: 'POST', url: '/api/admin/episodes', headers: { cookie: cookieHeader },
      payload: { season_id: season.id, number: 2, title: 'Ep2', publish_date: '2024-01-01', audio_type: 'upload', audio_path: '/audio/ep2.mp3' },
    })

    const del = await app.inject({ method: 'DELETE', url: `/api/admin/seasons/${season.id}`, headers: { cookie: cookieHeader } })
    expect(del.statusCode).toBe(204)

    expect(fs.existsSync(seasonCover)).toBe(false)
    expect(fs.existsSync(ep1Audio)).toBe(false)
    expect(fs.existsSync(ep2Audio)).toBe(false)
  })

  it('deleting an episode whose file is already missing on disk does not error', async () => {
    const season = await app.inject({
      method: 'POST', url: '/api/admin/seasons', headers: { cookie: cookieHeader },
      payload: { number: 4, title: 'S4' },
    }).then(r => r.json())

    const episode = await app.inject({
      method: 'POST', url: '/api/admin/episodes', headers: { cookie: cookieHeader },
      payload: {
        season_id: season.id, number: 1, title: 'Ep Missing File', publish_date: '2024-01-01',
        audio_type: 'upload', audio_path: '/audio/never-actually-written.mp3',
      },
    }).then(r => r.json())

    const del = await app.inject({ method: 'DELETE', url: `/api/admin/episodes/${episode.id}`, headers: { cookie: cookieHeader } })
    expect(del.statusCode).toBe(204)
  })
})
