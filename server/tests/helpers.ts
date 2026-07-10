import { initDb } from '../src/db/index.js'
import { buildApp } from '../src/app.js'

export function buildTestDb() {
  return initDb(':memory:')
}

export function buildTestApp() {
  return buildApp({ dbPath: ':memory:', logger: false })
}
