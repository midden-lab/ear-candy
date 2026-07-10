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
    const filename = 'test.mp3'
    const fileContent = 'fake audio content'
    const body = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${filename}"`,
      'Content-Type: audio/mpeg',
      '',
      fileContent,
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

    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.path).toMatch(/^\/audio\//)
    expect(json.path).toMatch(/\.mp3$/)
  })
})
