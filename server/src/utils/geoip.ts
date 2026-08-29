import fs from 'node:fs'
import { Reader, type CountryResponse } from 'maxmind'

// Country-level geolocation is an optional enhancement, not a hard
// dependency of analytics — an operator who hasn't run
// scripts/fetch-geoip-db.sh (or set GEOIP_DB_PATH) still gets working
// traffic/episode analytics, just without a country breakdown. This module
// must never throw and must never slow the request path waiting on a file
// that isn't there — it resolves the reader once (lazily, on first call)
// and caches the outcome (including "unavailable") for the process
// lifetime, since the underlying .mmdb file doesn't change without a
// restart in this deployment model.
type ReaderState = 'unloaded' | 'unavailable' | 'ready'

let readerState: ReaderState = 'unloaded'
let reader: Reader<CountryResponse> | null = null
let loggedUnavailable = false

function warnOnce(message: string): void {
  if (loggedUnavailable) return
  loggedUnavailable = true
  console.warn(`[geoip] ${message}`)
}

function loadReader(): void {
  if (readerState !== 'unloaded') return

  const dbPath = process.env.GEOIP_DB_PATH
  if (!dbPath) {
    readerState = 'unavailable'
    warnOnce('GEOIP_DB_PATH is not set — country breakdowns will be unavailable. See scripts/fetch-geoip-db.sh.')
    return
  }
  if (!fs.existsSync(dbPath)) {
    readerState = 'unavailable'
    warnOnce(`GEOIP_DB_PATH (${dbPath}) does not exist — country breakdowns will be unavailable. See scripts/fetch-geoip-db.sh.`)
    return
  }

  try {
    reader = new Reader<CountryResponse>(fs.readFileSync(dbPath))
    readerState = 'ready'
  } catch {
    readerState = 'unavailable'
    warnOnce(`Failed to parse GeoIP database at ${dbPath} — country breakdowns will be unavailable.`)
  }
}

/**
 * Resolves an IP to an ISO country code (e.g. "US"), or null if geo
 * resolution is unavailable (no database configured/present/parseable) or
 * the IP isn't found in the database (common for private/local IPs in
 * dev). Never throws. The raw IP is used only for this in-memory lookup —
 * it is never persisted; callers store only the returned country code.
 */
export async function resolveCountry(ip: string): Promise<string | null> {
  loadReader()
  if (readerState !== 'ready' || !reader) return null
  try {
    return reader.get(ip)?.country?.iso_code ?? null
  } catch {
    return null
  }
}

/** Test-only: clears the cached reader/state so tests can exercise both
 *  the "no database" and "database present" paths within one process. */
export function __resetGeoipCacheForTests(): void {
  readerState = 'unloaded'
  reader = null
  loggedUnavailable = false
}

/** Test-only: injects a fake reader directly, bypassing file loading —
 *  avoids needing a real (and unavoidably large) .mmdb fixture just to
 *  exercise the "database present and returns a result" path. */
export function __setGeoipReaderForTests(fakeReader: Pick<Reader<CountryResponse>, 'get'> | null): void {
  if (fakeReader) {
    reader = fakeReader as Reader<CountryResponse>
    readerState = 'ready'
  } else {
    reader = null
    readerState = 'unavailable'
  }
}
