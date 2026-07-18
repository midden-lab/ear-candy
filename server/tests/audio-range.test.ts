import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { FastifyInstance } from 'fastify'

// HTTP Range request support (206 Partial Content) is load-bearing for
// efficient seeking and sensible mobile data usage — without it, seeking
// forward in a large episode means re-downloading from the start instead of
// requesting just the needed byte range. @fastify/static supports this by
// default, but nothing previously asserted it — a future dependency bump or
// config change could silently regress it with no test catching it (issue
// #86). These tests lock in the currently-correct behavior.
describe('HTTP Range request support for /audio/ (issue #86)', () => {
  let app: FastifyInstance
  let tmpDir: string
  let originalCwd: string
  const fileContent = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz')

  beforeAll(async () => {
    originalCwd = process.cwd()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ear-candy-range-'))
    process.chdir(tmpDir)

    fs.mkdirSync(path.join(tmpDir, 'data', 'uploads'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'data', 'uploads', 'test-episode.mp3'), fileContent)

    app = buildApp({ dbPath: path.join(tmpDir, 'db.sqlite'), logger: false })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    process.chdir(originalCwd)
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('returns the full file as 200 when no Range header is sent', async () => {
    const res = await app.inject({ method: 'GET', url: '/audio/test-episode.mp3' })
    expect(res.statusCode).toBe(200)
    expect(res.rawPayload).toEqual(fileContent)
    expect(res.headers['accept-ranges']).toBe('bytes')
  })

  it('returns 206 Partial Content with the correct bytes for a byte-range request', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/audio/test-episode.mp3',
      headers: { range: 'bytes=5-9' },
    })
    expect(res.statusCode).toBe(206)
    expect(res.rawPayload).toEqual(fileContent.subarray(5, 10))
    expect(res.headers['content-range']).toBe(`bytes 5-9/${fileContent.length}`)
    expect(res.headers['content-length']).toBe('5')
  })

  it('returns 206 with everything from the offset to the end for an open-ended range', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/audio/test-episode.mp3',
      headers: { range: 'bytes=30-' },
    })
    expect(res.statusCode).toBe(206)
    expect(res.rawPayload).toEqual(fileContent.subarray(30))
    expect(res.headers['content-range']).toBe(`bytes 30-${fileContent.length - 1}/${fileContent.length}`)
  })

  it('returns 416 Range Not Satisfiable for a range beyond the file length', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/audio/test-episode.mp3',
      headers: { range: `bytes=${fileContent.length + 10}-${fileContent.length + 20}` },
    })
    expect(res.statusCode).toBe(416)
  })
})
