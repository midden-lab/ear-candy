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

function multipartBuffer(boundary: string, filename: string, contentType: string, content: Buffer) {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`),
    Buffer.from(`Content-Type: ${contentType}\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ])
}

// Real PNG/ICO magic bytes so uploads pass the magic-byte content check (issue #38).
const REAL_PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake favicon bytes')
])
const REAL_ICO_BYTES = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x01, 0x00]),
  Buffer.from('fake favicon bytes')
])

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
    expect(res.json()).toEqual({ error: 'Only PNG or ICO favicon uploads are allowed' })
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
    expect(res.json()).toEqual({ error: 'Only PNG or ICO favicon uploads are allowed' })
  })

  it('rejects an SVG upload (stored-XSS risk — embedded <script> executes if the file URL is opened directly)', async () => {
    const app = await makeApp()
    const cookie = await getAuthCookie(app)
    const boundary = '----testboundary'

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/upload/favicon',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody(boundary, 'favicon.svg', 'image/svg+xml', '<svg onload="alert(1)"></svg>')
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'Only PNG or ICO favicon uploads are allowed' })
  })

  it.each([
    ['favicon.png', 'image/png', REAL_PNG_BYTES],
    ['favicon.ico', 'image/x-icon', REAL_ICO_BYTES],
  ])('accepts a valid %s upload and returns a path under /images/', async (filename, mimetype, bytes) => {
    const app = await makeApp()
    const cookie = await getAuthCookie(app)
    const boundary = '----testboundary'

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/upload/favicon',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipartBuffer(boundary, filename, mimetype, bytes as Buffer)
    })

    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.path).toMatch(/^\/images\/favicon-[0-9a-f-]+\.(png|ico)$/)

    const savedPath = path.resolve('data/uploads/images', path.basename(json.path))
    expect(fs.existsSync(savedPath)).toBe(true)
    fs.unlinkSync(savedPath)
  })

  it('rejects a file whose extension/mimetype claim PNG but whose content is not a real PNG signature (issue #38)', async () => {
    const app = await makeApp()
    const cookie = await getAuthCookie(app)
    const boundary = '----testboundary'

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/upload/favicon',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody(boundary, 'disguised.png', 'image/png', 'not actually a png file')
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'File content does not match a recognized PNG or ICO image' })
  })
})
