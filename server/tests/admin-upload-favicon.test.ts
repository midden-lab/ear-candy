import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import bcrypt from 'bcrypt'
import { buildTestApp } from './helpers.js'

async function makeApp() {
  process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash('password', 10)
  return buildTestApp()
}

async function getAuthCookie(app: Awaited<ReturnType<typeof buildTestApp>>) {
  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { password: 'password' }
  })
  const setCookie = loginRes.headers['set-cookie'] as string | string[]
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie
  return cookieStr.split(';')[0]
}

function multipartBody(boundary: string, filename: string, contentType: string, content: string) {
  return [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    `Content-Type: ${contentType}`,
    '',
    content,
    `--${boundary}--`
  ].join('\r\n')
}

describe('POST /api/admin/upload/favicon', () => {
  afterEach(() => {
    delete process.env.ADMIN_PASSWORD_HASH
  })

  it('returns 401 without auth cookie', async () => {
    const app = await makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/upload/favicon'
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 when no file is uploaded', async () => {
    const app = await makeApp()
    const cookie = await getAuthCookie(app)

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/upload/favicon',
      headers: { cookie, 'content-type': 'multipart/form-data; boundary=----boundary' },
      payload: '------boundary--\r\n'
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'No file uploaded' })
  })

  it('rejects a disallowed extension (e.g. .html)', async () => {
    const app = await makeApp()
    const cookie = await getAuthCookie(app)
    const boundary = '----testboundary'

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/upload/favicon',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody(boundary, 'evil.html', 'text/html', '<script>alert(1)</script>')
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'Only PNG, ICO, or SVG favicon uploads are allowed' })
  })

  it('rejects an allowed extension with a mismatched mimetype', async () => {
    const app = await makeApp()
    const cookie = await getAuthCookie(app)
    const boundary = '----testboundary'

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/upload/favicon',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody(boundary, 'disguised.png', 'text/html', '<script>alert(1)</script>')
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'Only PNG, ICO, or SVG favicon uploads are allowed' })
  })

  it.each([
    ['favicon.png', 'image/png'],
    ['favicon.ico', 'image/x-icon'],
    ['favicon.svg', 'image/svg+xml'],
  ])('accepts a valid %s upload and returns a path under /images/', async (filename, mimetype) => {
    const app = await makeApp()
    const cookie = await getAuthCookie(app)
    const boundary = '----testboundary'

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/upload/favicon',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody(boundary, filename, mimetype, 'fake favicon bytes')
    })

    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.path).toMatch(/^\/images\/favicon-[0-9a-f-]+\.(png|ico|svg)$/)

    const savedPath = path.resolve('data/uploads/images', path.basename(json.path))
    expect(fs.existsSync(savedPath)).toBe(true)
    fs.unlinkSync(savedPath)
  })
})
