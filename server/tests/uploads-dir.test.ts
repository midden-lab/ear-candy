import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('uploads directory bootstrap', () => {
  let tmpDir: string
  let originalCwd: string

  beforeAll(() => {
    originalCwd = process.cwd()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ear-candy-uploads-'))
    process.chdir(tmpDir)
  })

  afterAll(() => {
    process.chdir(originalCwd)
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('creates data/uploads on startup if missing, e.g. an empty mounted volume', async () => {
    const uploadsDir = path.join(tmpDir, 'data', 'uploads')
    expect(fs.existsSync(uploadsDir)).toBe(false)

    const app = buildApp({ dbPath: path.join(tmpDir, 'db.sqlite'), logger: false })
    await app.ready()

    expect(fs.existsSync(uploadsDir)).toBe(true)
    await app.close()
  })
})
