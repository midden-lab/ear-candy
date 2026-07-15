import { describe, it, expect, afterEach, vi } from 'vitest'
import bcrypt from 'bcrypt'
import { buildTestApp } from './helpers.js'

// Mock node:stream/promises and node:fs at the module level for ESM compatibility
vi.mock('node:stream/promises', () => ({
  pipeline: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('node:fs', () => {
  const mockWritable = {
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
    removeListener: vi.fn(),
    pipe: vi.fn(),
    writable: true,
    writableEnded: false
  }
  return {
    default: {
      createWriteStream: vi.fn().mockReturnValue(mockWritable)
    },
    createWriteStream: vi.fn().mockReturnValue(mockWritable)
  }
})

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

// Real ID3 header bytes ("ID3" + version/flags/size) so uploads pass the
// magic-byte content check (issue #38), followed by arbitrary filler.
const REAL_MP3_BYTES = Buffer.concat([
  Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  Buffer.from('fake audio content')
])

function multipartBuffer(boundary: string, filename: string, contentType: string, content: string | Buffer) {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`),
    Buffer.from(`Content-Type: ${contentType}\r\n\r\n`),
    Buffer.isBuffer(content) ? content : Buffer.from(content),
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ])
}

describe('POST /api/admin/upload', () => {
  afterEach(() => {
    delete process.env.ADMIN_PASSWORD_HASH
    vi.clearAllMocks()
  })

  it('returns 401 without auth cookie', async () => {
    const app = await makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/upload'
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 when no file is uploaded', async () => {
    const app = await makeApp()
    const cookie = await getAuthCookie(app)

    // Send a multipart request with no file part
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/upload',
      headers: {
        cookie,
        'content-type': 'multipart/form-data; boundary=----boundary'
      },
      payload: '------boundary--\r\n'
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'No file uploaded' })
  })

  it('uploads a file and returns path starting with /audio/', async () => {
    const app = await makeApp()
    const cookie = await getAuthCookie(app)

    const boundary = '----testboundary'
    const body = multipartBuffer(boundary, 'test.mp3', 'audio/mpeg', REAL_MP3_BYTES)

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/upload',
      headers: {
        cookie,
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: body
    })

    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.path).toMatch(/^\/audio\//)
    expect(json.path).toMatch(/\.mp3$/)
  })

  it('rejects a file whose extension/mimetype claim audio but whose content is not a real audio signature (issue #38)', async () => {
    const app = await makeApp()
    const cookie = await getAuthCookie(app)

    const boundary = '----testboundary'
    const body = multipartBuffer(boundary, 'disguised.mp3', 'audio/mpeg', 'not actually an mp3 file')

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/upload',
      headers: {
        cookie,
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: body
    })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'File content does not match a recognized audio format' })
  })

  it('rejects a file with a disallowed extension (e.g. .html)', async () => {
    const app = await makeApp()
    const cookie = await getAuthCookie(app)

    const boundary = '----testboundary'
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="evil.html"',
      'Content-Type: text/html',
      '',
      '<script>alert(document.cookie)</script>',
      `--${boundary}--`
    ].join('\r\n')

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/upload',
      headers: {
        cookie,
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: body
    })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'Only audio file uploads are allowed' })
  })

  it('rejects an audio extension with a mismatched, non-audio mimetype', async () => {
    const app = await makeApp()
    const cookie = await getAuthCookie(app)

    const boundary = '----testboundary'
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="disguised.mp3"',
      'Content-Type: text/html',
      '',
      '<script>alert(1)</script>',
      `--${boundary}--`
    ].join('\r\n')

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/upload',
      headers: {
        cookie,
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: body
    })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'Only audio file uploads are allowed' })
  })
})
