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

function multipartBody(boundary: string, filename: string, contentType: string, content: Buffer | string) {
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  const body = typeof content === 'string' ? Buffer.from(content) : content
  return Buffer.concat([head, body, tail])
}

const fixtureImage = fs.readFileSync(path.join(import.meta.dirname, 'fixtures/test-cover.jpg'))

describe('POST /api/admin/upload/image', () => {
  afterEach(() => {
    delete process.env.ADMIN_PASSWORD_HASH
  })

  it('returns 401 without auth cookie', async () => {
    const app = await makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/upload/image'
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 when no file is uploaded', async () => {
    const app = await makeApp()
    const cookie = await getAuthCookie(app)

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/upload/image',
      headers: {
        cookie,
        'content-type': 'multipart/form-data; boundary=----boundary'
      },
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
      url: '/api/admin/upload/image',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody(boundary, 'evil.html', 'text/html', '<script>alert(1)</script>')
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'Only JPEG, PNG, or WebP image uploads are allowed' })
  })

  it('rejects an image extension with a mismatched, non-image mimetype', async () => {
    const app = await makeApp()
    const cookie = await getAuthCookie(app)
    const boundary = '----testboundary'

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/upload/image',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody(boundary, 'disguised.jpg', 'text/html', '<script>alert(1)</script>')
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'Only JPEG, PNG, or WebP image uploads are allowed' })
  })

  it('rejects a file with a correct extension/mimetype but non-image bytes', async () => {
    const app = await makeApp()
    const cookie = await getAuthCookie(app)
    const boundary = '----testboundary'

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/upload/image',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody(boundary, 'fake.jpg', 'image/jpeg', 'this is not actually a jpeg')
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'Uploaded file is not a valid image' })
  })

  it('accepts a valid image, resizes it, and returns thumb/detail webp paths', async () => {
    const app = await makeApp()
    const cookie = await getAuthCookie(app)
    const boundary = '----testboundary'

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/upload/image',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody(boundary, 'cover.jpg', 'image/jpeg', fixtureImage)
    })

    expect(res.statusCode).toBe(200)
    const json = res.json() as { thumb: string; detail: string }
    expect(json.thumb).toMatch(/^\/images\/[0-9a-f-]+-thumb\.webp$/)
    expect(json.detail).toMatch(/^\/images\/[0-9a-f-]+-detail\.webp$/)

    const thumbFile = path.resolve('data/uploads/images', path.basename(json.thumb))
    const detailFile = path.resolve('data/uploads/images', path.basename(json.detail))
    expect(fs.existsSync(thumbFile)).toBe(true)
    expect(fs.existsSync(detailFile)).toBe(true)

    const sharp = (await import('sharp')).default
    const thumbMeta = await sharp(thumbFile).metadata()
    const detailMeta = await sharp(detailFile).metadata()
    expect(thumbMeta).toMatchObject({ width: 150, height: 150, format: 'webp' })
    expect(detailMeta).toMatchObject({ width: 640, height: 640, format: 'webp' })

    fs.unlinkSync(thumbFile)
    fs.unlinkSync(detailFile)
  })
})
