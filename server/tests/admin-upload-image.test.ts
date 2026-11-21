import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import bcrypt from 'bcrypt'
import sharp from 'sharp'
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

// ---------------------------------------------------------------------------
// Security audit M3 (plan 020 step 8): validate the real content before sharp.
// ---------------------------------------------------------------------------
describe('POST /api/admin/upload/image — content validation before sharp', () => {
  afterEach(() => {
    delete process.env.ADMIN_PASSWORD_HASH
  })

  async function upload(filename: string, contentType: string, content: Buffer | string) {
    const app = await makeApp()
    const cookie = await getAuthCookie(app)
    const boundary = '----testboundary'
    return app.inject({
      method: 'POST',
      url: '/api/admin/upload/image',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody(boundary, filename, contentType, content),
    })
  }

  const NOT_AN_IMAGE = 'Uploaded file is not a valid image'

  it('rejects content that is really SVG/GIF/BMP/TIFF even though the name and MIME type say PNG', async () => {
    const spoofs: Record<string, Buffer> = {
      svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'),
      gif: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
      bmp: Buffer.concat([Buffer.from('BM'), Buffer.alloc(60)]),
      tiff: Buffer.concat([Buffer.from([0x49, 0x49, 0x2a, 0x00]), Buffer.alloc(60)]),
    }
    for (const [name, content] of Object.entries(spoofs)) {
      const res = await upload('cover.png', 'image/png', content)
      expect(res.statusCode, name).toBe(400)
      expect(res.json(), name).toEqual({ error: NOT_AN_IMAGE })
    }
  })

  it('still accepts real JPEG, PNG and WebP, with the same {thumb, detail} response shape', async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#3366cc' } }).png().toBuffer()
    const webp = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#cc6633' } }).webp().toBuffer()
    const cases: Array<[string, string, Buffer]> = [
      ['cover.jpg', 'image/jpeg', fixtureImage],
      ['cover.png', 'image/png', png],
      ['cover.webp', 'image/webp', webp],
    ]
    for (const [filename, mime, content] of cases) {
      const res = await upload(filename, mime, content)
      expect(res.statusCode, filename).toBe(200)
      const body = res.json() as { thumb: string; detail: string }
      expect(body.thumb, filename).toMatch(/^\/images\/[0-9a-f-]+-thumb\.webp$/)
      expect(body.detail, filename).toMatch(/^\/images\/[0-9a-f-]+-detail\.webp$/)
    }
  })

  it('keeps accepting a real image whose extension disagrees with its content (e.g. a PNG saved as .jpg)', async () => {
    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#112233' } }).png().toBuffer()
    const res = await upload('photo.jpg', 'image/jpeg', png)
    expect(res.statusCode).toBe(200)
  })

  it('still accepts a 4000x4000 (16 megapixel) JPEG, well under the pixel limit', async () => {
    const big = await sharp({
      create: { width: 4000, height: 4000, channels: 3, background: '#778899' },
    }).jpeg({ quality: 40 }).toBuffer()
    const res = await upload('big.jpg', 'image/jpeg', big)
    expect(res.statusCode).toBe(200)
  })

  it('rejects an image over the 50 megapixel limit with a clear 400, not a 500', async () => {
    // A genuinely valid 7500x7500 (56 MP) PNG. Solid colour, so it is only
    // ~180KB on the wire — far under the 15MB body cap — yet it decodes to
    // ~170MB of pixels. Without limitInputPixels sharp accepts it.
    const huge = await sharp({
      create: { width: 7500, height: 7500, channels: 3, background: '#ffffff' },
    }).png({ compressionLevel: 9 }).toBuffer()
    expect(huge.length).toBeLessThan(15 * 1024 * 1024)

    const res = await upload('huge.png', 'image/png', huge)
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'Image dimensions exceed the 50 megapixel limit' })
  })

  it('returns 400 (not 500) for a signature-valid file that fails to decode, and leaves no output files behind', async () => {
    const imagesDir = path.resolve('data/uploads/images')
    fs.mkdirSync(imagesDir, { recursive: true })
    const before = new Set(fs.readdirSync(imagesDir))
    // JPEG magic followed by garbage: passes the signature check, fails in sharp.
    const res = await upload('broken.jpg', 'image/jpeg', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 0x41)]))
    expect(res.statusCode).toBe(400)
    const leaked = fs.readdirSync(imagesDir).filter(f => !before.has(f))
    expect(leaked).toEqual([])
  })
})
