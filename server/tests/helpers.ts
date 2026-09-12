import { Writable } from 'node:stream'
import pino from 'pino'
import { initDb } from '../src/db/index.js'
import { buildApp } from '../src/app.js'

export function buildTestDb() {
  return initDb(':memory:')
}

export function buildTestApp() {
  return buildApp({ dbPath: ':memory:', logger: false })
}

/** Like buildTestApp(), but with a real, capturable pino logger instead of
 *  logger:false — for tests that need to assert on what does or doesn't
 *  get logged (e.g. PRIV-1's disableRequestLogging verification). `logs`
 *  accumulates every parsed JSON line written by the time a test inspects
 *  it. */
export function buildTestAppWithLogCapture() {
  const logs: Record<string, unknown>[] = []
  // pino requires a real stream.Writable instance as its destination — a
  // plain duck-typed `{ write: fn }` object is silently ignored in favor
  // of pino's default (real stdout), confirmed directly while building
  // this helper.
  const stream = new Writable({
    write(chunk: Buffer, _enc, callback) {
      for (const line of chunk.toString().split('\n')) {
        if (!line.trim()) continue
        logs.push(JSON.parse(line) as Record<string, unknown>)
      }
      callback()
    },
  })
  const loggerInstance = pino(stream)
  const app = buildApp({ dbPath: ':memory:', loggerInstance })
  return { app, logs }
}
