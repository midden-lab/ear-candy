import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveCountry, __resetGeoipCacheForTests, __setGeoipReaderForTests } from '../src/utils/geoip.js'

describe('resolveCountry', () => {
  const originalEnv = process.env.GEOIP_DB_PATH

  beforeEach(() => {
    __resetGeoipCacheForTests()
  })

  afterEach(() => {
    __resetGeoipCacheForTests()
    if (originalEnv === undefined) delete process.env.GEOIP_DB_PATH
    else process.env.GEOIP_DB_PATH = originalEnv
  })

  it('returns null without throwing when GEOIP_DB_PATH is unset', async () => {
    delete process.env.GEOIP_DB_PATH
    await expect(resolveCountry('8.8.8.8')).resolves.toBeNull()
  })

  it('returns null without throwing when GEOIP_DB_PATH points at a nonexistent file', async () => {
    process.env.GEOIP_DB_PATH = '/nonexistent/path/to/db.mmdb'
    await expect(resolveCountry('8.8.8.8')).resolves.toBeNull()
  })

  it('returns null without throwing when GEOIP_DB_PATH points at a corrupt/non-mmdb file', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ear-candy-geoip-test-'))
    const badPath = path.join(tmpDir, 'not-a-real.mmdb')
    fs.writeFileSync(badPath, 'this is not a valid mmdb file')
    process.env.GEOIP_DB_PATH = badPath
    try {
      await expect(resolveCountry('8.8.8.8')).resolves.toBeNull()
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })

  it('returns a correct ISO country code once a (fake) database is loaded', async () => {
    __setGeoipReaderForTests({
      get: (ip: string) => (ip === '8.8.8.8' ? { country: { iso_code: 'US', geoname_id: 1, names: { en: 'United States' } } } : null),
    })
    await expect(resolveCountry('8.8.8.8')).resolves.toBe('US')
  })

  it('returns null for an IP not found in the database', async () => {
    __setGeoipReaderForTests({ get: () => null })
    await expect(resolveCountry('127.0.0.1')).resolves.toBeNull()
  })

  it('returns null (not throw) if the reader itself throws on a malformed IP', async () => {
    __setGeoipReaderForTests({
      get: () => { throw new Error('invalid IP address') },
    })
    await expect(resolveCountry('not-an-ip')).resolves.toBeNull()
  })

  it('caches the reader across calls rather than re-reading the file every time', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ear-candy-geoip-test-'))
    const dbPath = path.join(tmpDir, 'db.mmdb')
    fs.writeFileSync(dbPath, 'still not valid, but existence is enough for this test')
    process.env.GEOIP_DB_PATH = dbPath
    try {
      await resolveCountry('8.8.8.8')
      fs.rmSync(dbPath) // if resolveCountry re-read the file per call, this would now throw ENOENT internally
      await expect(resolveCountry('8.8.8.8')).resolves.toBeNull()
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })
})
