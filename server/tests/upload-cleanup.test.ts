import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import bcrypt from 'bcrypt'
import { buildTestApp } from './helpers.js'

// Security audit L4 (plan 020 step 8): if writing an upload to disk fails
// partway (disk error, aborted/errored request stream, size limit), the
// partial file used to stay in data/uploads - publicly addressable by its
// UUID name, unreferenced, and never cleaned up. Runs in a throwaway cwd
// (same technique as uploads-dir.test.ts) so it can assert on the WHOLE
// directory without racing other test files that upload into data/.

describe('failed upload writes leave no partial file behind', () => {
  let tmpDir: string
  let originalCwd: string

  beforeAll(() => {
    originalCwd = process.cwd()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ear-candy-upload-cleanup-'))
    process.chdir(tmpDir)
    // Production always has this directory (created at startup / by the
    // mounted volume). Without it the audio route 500s on a missing dir
    // before any write happens and "no leftover file" passes vacuously.
    fs.mkdirSync(path.join(tmpDir, 'data', 'uploads'), { recursive: true })
  })

  afterAll(() => {
    process.chdir(originalCwd)
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.ADMIN_PASSWORD_HASH
  })

  /** Make every write stream fail ("disk full") right after its first write. */
  function failWritesAfterFirstChunk() {
    const real = fs.createWriteStream
    vi.spyOn(fs, 'createWriteStream').mockImplementation(((p: fs.PathLike, o?: unknown) => {
      const ws = real(p, o as never)
      const origWrite = ws.write.bind(ws) as (...a: unknown[]) => boolean
      let writes = 0
      ;(ws as unknown as { write: unknown }).write = (...a: unknown[]) => {
        const r = origWrite(...a)
        if (++writes === 1) setImmediate(() => ws.destroy(new Error('ENOSPC: simulated disk full')))
        return r
      }
      return ws
    }) as typeof fs.createWriteStream)
  }

  async function authed() {
    process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash('password', 10)
    const app = buildTestApp()
    const login = await app.inject({ method: 'POST', url: '/api/admin/login', payload: { password: 'password' } })
    const sc = login.headers['set-cookie'] as string | string[]
    return { app, cookie: (Array.isArray(sc) ? sc[0] : sc).split(';')[0] }
  }

  function multipart(filename: string, contentType: string, content: Buffer) {
    const boundary = '----cleanupboundary'
    return {
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`),
        content,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]),
    }
  }

  const listFiles = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f !== '.gitkeep') : [])

  it('audio upload: a failed write removes the partial file (and the request fails cleanly)', async () => {
    const { app, cookie } = await authed()
    const audioDir = path.resolve('data/uploads')
    expect(listFiles(audioDir).filter(f => f.endsWith('.mp3'))).toEqual([])

    failWritesAfterFirstChunk()
    const mp3 = Buffer.concat([Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00'), Buffer.alloc(64 * 1024, 0x55)])
    const { headers, payload } = multipart('episode.mp3', 'audio/mpeg', mp3)
    const res = await app.inject({ method: 'POST', url: '/api/admin/upload', headers: { cookie, ...headers }, payload })

    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({ error: 'Internal server error' })
    expect(listFiles(audioDir).filter(f => f.endsWith('.mp3'))).toEqual([])
  })

  it('favicon upload: a failed write removes the partial file', async () => {
    const { app, cookie } = await authed()
    const imagesDir = path.resolve('data/uploads/images')

    failWritesAfterFirstChunk()
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32 * 1024, 0x11)])
    const { headers, payload } = multipart('favicon.png', 'image/png', png)
    const res = await app.inject({ method: 'POST', url: '/api/admin/upload/favicon', headers: { cookie, ...headers }, payload })

    expect(res.statusCode).toBe(500)
    expect(listFiles(imagesDir).filter(f => f.startsWith('favicon-'))).toEqual([])
  })

  it('a successful upload is untouched by the cleanup (file stays)', async () => {
    const { app, cookie } = await authed()
    const audioDir = path.resolve('data/uploads')
    const mp3 = Buffer.concat([Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00'), Buffer.alloc(4096, 0x55)])
    const { headers, payload } = multipart('ok.mp3', 'audio/mpeg', mp3)
    const res = await app.inject({ method: 'POST', url: '/api/admin/upload', headers: { cookie, ...headers }, payload })

    expect(res.statusCode).toBe(200)
    const { path: p } = res.json() as { path: string }
    expect(fs.existsSync(path.join(audioDir, path.basename(p)))).toBe(true)
  })
})
