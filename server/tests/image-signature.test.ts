import { describe, it, expect } from 'vitest'
import { matchesImageSignature } from '../src/utils/magicBytes.js'

// Security audit M3: the image upload route only trusted the filename
// extension and client-supplied MIME type, then let sharp decode by CONTENT,
// so a file named x.png that was really an SVG/GIF/TIFF reached libvips'
// other decoders (incl. librsvg, the path behind sharp's advisory).
// Deliberately content-only (any of JPEG/PNG/WebP, whatever the extension
// says): that keeps every upload that works today working (e.g. a real PNG
// someone saved as photo.jpg) while still keeping other formats out of sharp.
const head = (b: Buffer) => b.subarray(0, 12)

describe('matchesImageSignature', () => {
  it('accepts JPEG, PNG and WebP', () => {
    expect(matchesImageSignature(head(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1])))).toBe(true)
    expect(matchesImageSignature(head(Buffer.from([0xff, 0xd8, 0xff, 0xdb])))).toBe(true)
    expect(matchesImageSignature(head(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])))).toBe(true)
    expect(matchesImageSignature(Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 ')]).subarray(0, 12))).toBe(true)
  })

  it('rejects SVG, GIF, BMP, TIFF, HTML and other non-JPEG/PNG/WebP content', () => {
    const rejected: Record<string, Buffer> = {
      svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      svgWithXmlDecl: Buffer.from('<?xml version="1.0"?><svg/>'),
      gif89: Buffer.from('GIF89a\x01\x00\x01\x00'),
      gif87: Buffer.from('GIF87a\x01\x00\x01\x00'),
      bmp: Buffer.from('BM\x36\x00\x00\x00\x00\x00\x00\x00'),
      tiffLE: Buffer.from([0x49, 0x49, 0x2a, 0x00, 0, 0, 0, 0]),
      tiffBE: Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 0]),
      html: Buffer.from('<!doctype html><script>alert(1)</script>'),
      wavNotWebp: Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WAVEfmt ')]),
      pdf: Buffer.from('%PDF-1.7'),
      mp3: Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00'),
    }
    for (const [name, buf] of Object.entries(rejected)) {
      expect(matchesImageSignature(head(buf)), name).toBe(false)
    }
  })

  it('rejects empty and too-short buffers without throwing', () => {
    expect(matchesImageSignature(Buffer.alloc(0))).toBe(false)
    expect(matchesImageSignature(Buffer.from([0xff, 0xd8]))).toBe(false) // truncated JPEG magic
    expect(matchesImageSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // truncated PNG magic
    expect(matchesImageSignature(Buffer.from('RIFF'))).toBe(false)
  })
})
