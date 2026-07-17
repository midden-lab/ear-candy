import { describe, it, expect } from 'vitest'
import { isValidMediaPath } from '../src/utils/validation.js'

describe('isValidMediaPath', () => {
  it('accepts real upload-shaped local audio paths', () => {
    expect(isValidMediaPath('/audio/550e8400-e29b-41d4-a716-446655440000.mp3')).toBe(true)
    expect(isValidMediaPath('/audio/abc123.wav')).toBe(true)
  })

  it('accepts real upload-shaped local image paths (cover art + favicon)', () => {
    expect(isValidMediaPath('/images/550e8400-e29b-41d4-a716-446655440000-detail.webp')).toBe(true)
    expect(isValidMediaPath('/images/550e8400-e29b-41d4-a716-446655440000-thumb.webp')).toBe(true)
    expect(isValidMediaPath('/images/favicon-abc123.png')).toBe(true)
    expect(isValidMediaPath('/images/favicon-abc123.ico')).toBe(true)
  })

  it('accepts absolute http(s) URLs', () => {
    expect(isValidMediaPath('https://example.com/episode.mp3')).toBe(true)
    expect(isValidMediaPath('http://example.com/cover.jpg')).toBe(true)
  })

  it('rejects path traversal attempts', () => {
    expect(isValidMediaPath('/audio/../../../etc/passwd')).toBe(false)
    expect(isValidMediaPath('/audio/..%2F..%2Fetc%2Fpasswd')).toBe(false)
    expect(isValidMediaPath('/images/../../server/src/app.ts')).toBe(false)
    expect(isValidMediaPath('/audio/..')).toBe(false)
  })

  it('rejects extra path segments beyond a single filename', () => {
    expect(isValidMediaPath('/audio/sub/dir/file.mp3')).toBe(false)
    expect(isValidMediaPath('/audio//file.mp3')).toBe(false)
  })

  it('rejects a filename with no extension', () => {
    expect(isValidMediaPath('/audio/noextension')).toBe(false)
  })

  it('rejects a filename starting with a dot', () => {
    expect(isValidMediaPath('/audio/.hidden.mp3')).toBe(false)
  })

  it('rejects embedded null bytes and other control/whitespace characters', () => {
    expect(isValidMediaPath('/audio/file\x00.mp3')).toBe(false)
    expect(isValidMediaPath('/audio/file name.mp3')).toBe(false)
    expect(isValidMediaPath('/audio/file\n.mp3')).toBe(false)
  })

  it('rejects dangerous URL schemes', () => {
    expect(isValidMediaPath('javascript:alert(1)')).toBe(false)
    expect(isValidMediaPath('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isValidMediaPath('file:///etc/passwd')).toBe(false)
  })

  it('rejects a bare relative path with no scheme and no known local prefix', () => {
    expect(isValidMediaPath('not-a-path')).toBe(false)
    expect(isValidMediaPath('/uploads/file.mp3')).toBe(false)
  })
})
