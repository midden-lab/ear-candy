import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import type { FastifyInstance } from 'fastify'

describe('static file serving', () => {
  let app: FastifyInstance
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ear-candy-test-'))
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html><body>SPA</body></html>')
    fs.writeFileSync(path.join(tmpDir, 'robots.txt'), 'User-agent: *\nDisallow: /api/\n')
    fs.writeFileSync(path.join(tmpDir, 'llms.txt'), '# Ear Candy\n')
    app = buildApp({ dbPath: ':memory:', logger: false, clientDistPath: tmpDir })
    await app.ready()
  })

  afterAll(async () => {
    fs.rmSync(tmpDir, { recursive: true })
    await app.close()
  })

  it('serves index.html at /', async () => {
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('SPA')
  })

  it('serves index.html for unknown routes (SPA fallback)', async () => {
    const res = await app.inject({ method: 'GET', url: '/some/deep/route' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('SPA')
  })

  it('serves robots.txt as a real static file, not the SPA fallback', async () => {
    const res = await app.inject({ method: 'GET', url: '/robots.txt' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Disallow: /api/')
  })

  it('serves llms.txt as a real static file, not the SPA fallback', async () => {
    const res = await app.inject({ method: 'GET', url: '/llms.txt' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('# Ear Candy')
  })
})
