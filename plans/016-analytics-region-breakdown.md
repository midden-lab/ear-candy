---
id: analytics-region-breakdown
title: "Add state/province (region) breakdown to first-party analytics"
status: pending
priority: 2
created: 2026-09-09
steps_completed: 0
steps_total: 7
tags: [analytics, geoip, backend, admin-ui]
---

# Add State/Province (Region) Breakdown to First-Party Analytics

## Summary

Extends Ear Candy's existing country-level GeoIP breakdown down to state/province, by swapping the optional GeoIP database from DB-IP's free "Country Lite" tier to their free "City Lite" tier (which is the tier that actually carries subdivision data) and threading a new `region` field through the same `events` table, breakdown endpoint, and admin dashboard pattern the `country` column already uses. This is a data-source swap plus one new column, not a new subsystem — the existing analytics architecture (plan 001) already has the right shape for this.

## Context

**Why this needs a data-source change, not just a code change:** `server/src/utils/geoip.ts` currently types its reader as `maxmind`'s `CountryResponse`, and `scripts/fetch-geoip-db.sh` downloads DB-IP's free **Country Lite** `.mmdb` file — confirmed by inspection, this tier's response shape has no subdivision field at all. `mmdb-lib`'s `CityResponse` (in `server/node_modules/mmdb-lib/lib/reader/response.d.ts`) extends `CountryResponse` with `subdivisions?: SubdivisionsRecord[]` (each with `iso_code` and `names`) — getting region data requires reading a City-tier database file, which DB-IP also publishes for free under the same CC BY 4.0 licensing and same no-signup download model as Country Lite (verify the exact current URL pattern when implementing — DB-IP's naming convention is `dbip-city-lite-<year>-<month>.mmdb.gz`, analogous to the country file `fetch-geoip-db.sh` already downloads).

**Real, non-code tradeoff worth restating (from the exploratory discussion that produced this plan):** the City Lite file is meaningfully larger than Country Lite (tens of MB vs a few MB) and `geoip.ts`'s `loadReader()` reads the whole file into memory via `fs.readFileSync` once at first use — a real, if modest, memory-footprint increase on whatever host runs this. Separately, state-level IP geolocation is inherently less accurate than country-level (mobile carriers and VPN exit points routinely resolve to the wrong state even when the country is correct) — this ships a breakdown that is real, useful, and *noisier* than the country one, not a strictly-better version of it. Neither of these is a reason not to build it, but both belong in the admin-facing copy (Step 5) so an operator doesn't mistake regional aggregates for precise data.

**Files involved:**
- `server/src/db/migrate.ts` — new migration (version 8) for `events.region`.
- `server/src/utils/geoip.ts` — currently exports `resolveCountry(ip): Promise<string | null>`, typed against `CountryResponse`, with a lazily-loaded, cached-forever `Reader`. This plan replaces its one exported function with `resolveLocation(ip): Promise<{ country: string | null; region: string | null }>`, typed against `CityResponse`, so a single `.get(ip)` mmdb lookup yields both fields instead of requiring two separate lookups (the country and region data live in the same response object already — there is no reason to look them up separately).
- `server/src/routes/analytics.ts` — the only call site of `resolveCountry` (`const country = await resolveCountry(req.ip)`, roughly line 108). Becomes the only call site of `resolveLocation`.
- `server/src/routes/admin/analytics.ts` — `breakdownFor(app, column, ws)` is already a fully generic helper (groups `events` by any column, `page_view`-scoped, window-scoped) — adding a region breakdown is one more call to it, not new query logic.
- `server/src/types.ts` / `client/src/types.ts` — `AnalyticsBreakdowns` interface.
- `client/src/pages/admin/AdminAnalytics.tsx` — renders one `<BreakdownList title="..." rows={...} />` per breakdown category already; `BreakdownList` shows the raw `key` string with no name-lookup or flag rendering (confirmed — `countries` today displays raw ISO codes like "US", not "United States"), so `regions` follows the same convention with no new UI component.
- `client/src/tests/AdminAnalytics.test.tsx` — has exactly two full `AnalyticsBreakdowns` object literals (`breakdownsWithData` at line 31, `emptyBreakdowns` at line 43) that will fail to typecheck the moment `regions` is added to the interface — **this is the entire client-side blast radius**, confirmed by direct search; nothing else in the client constructs a full `AnalyticsBreakdowns` literal.
- `scripts/fetch-geoip-db.sh`, `README.md`, `.env.example` (wherever `GEOIP_DB_PATH` is documented) — need updated wording once the fetched file is City-tier, not Country-tier.

**Region key format — decided, not left open:** stored as the compound ISO 3166-2 form (e.g. `US-CA`, `CA-ON`), not the bare subdivision code (`CA` alone). `breakdownFor` groups by one flat column value with no join back to `country` — a bare subdivision code is genuinely ambiguous across countries (many countries independently reuse short subdivision codes), while the compound form is unambiguous, human-recognizable, and is the actual real-world ISO 3166-2 standard rather than an invented format. Built as `` `${country.iso_code}-${subdivisions[0].iso_code}` ``; if either half is missing from a given lookup, `region` resolves to `null` rather than a partial string.

**Storage scope matches `country`'s existing pattern exactly:** `region` is stored on every event row (all four event types), same as `country` today — the *display* scoping to `page_view`-only happens in `breakdownFor` at query time, not at insert time. No new scoping logic needed.

## Steps

### Step 1: Add the `events.region` column

**Files:** `server/src/db/migrate.ts`, `server/tests/migrate.test.ts`

**Requires review:** true — schema migration.

Add to `MIGRATIONS`, version 8:
```ts
{
  version: 8,
  description: 'events.region',
  alreadyApplied: db => columnExists(db, 'events', 'region'),
  up: db => { db.prepare('ALTER TABLE events ADD COLUMN region TEXT').run() },
},
```
Nullable, no default (matches `country`, which is also a nullable `TEXT` column with no default). Update the two tests that assert the exact `events` column list / exact migration count+list (`migrate.test.ts`'s `'creates the events table with the expected columns...'` and the `schema_migrations tracking` describe block's exact-array assertions) — same pattern as versions 6/7 already required.

**Acceptance criteria:**
- [ ] Fresh `:memory:` DB has `events.region`.
- [ ] A pre-existing `events` table lacking the column gets it added (mirror the existing per-column "predates the column" test pattern).
- [ ] `schema_migrations` records version 8 with description `'events.region'`.
- [ ] `make test` (server) passes.

---

### Step 2: Extend the GeoIP resolver to return region alongside country

**Files:** `server/src/utils/geoip.ts`, `server/tests/geoip.test.ts`

**Requires review:** false

Replace the `CountryResponse` import/type with `CityResponse`, and replace the exported `resolveCountry` function with:
```ts
export async function resolveLocation(ip: string): Promise<{ country: string | null; region: string | null }> {
  loadReader()
  if (readerState !== 'ready' || !reader) return { country: null, region: null }
  try {
    const result = reader.get(ip)
    const country = result?.country?.iso_code ?? null
    const subdivisionCode = result?.subdivisions?.[0]?.iso_code
    const region = country && subdivisionCode ? `${country}-${subdivisionCode}` : null
    return { country, region }
  } catch {
    return { country: null, region: null }
  }
}
```
Keep `loadReader()`, the `ReaderState` caching, `warnOnce`, and both test-only helpers (`__resetGeoipCacheForTests`, `__setGeoipReaderForTests`) exactly as-is — only the exported resolver function and its type parameter change. `__setGeoipReaderForTests`'s fake-reader shape (`Pick<Reader<CountryResponse>, 'get'>`) becomes `Pick<Reader<CityResponse>, 'get'>` so test fakes can supply `subdivisions` too.

**Acceptance criteria:**
- [ ] `resolveLocation` returns `{ country: null, region: null }` (never throws) when the DB is unconfigured/missing/corrupt — mirror all three existing `resolveCountry` "never throws" tests.
- [ ] A fake reader returning a response with `country.iso_code: 'US'` and `subdivisions: [{ iso_code: 'CA', ... }]` resolves `{ country: 'US', region: 'US-CA' }`.
- [ ] A fake reader returning country but no `subdivisions` (e.g. a country too small to subdivide, or an operator still pointing `GEOIP_DB_PATH` at an old Country-tier file) resolves `{ country: 'US', region: null }` — the missing region half must not throw or produce a malformed key.
- [ ] `make test` (server) passes.

---

### Step 3: Wire region into event storage

**Files:** `server/src/routes/analytics.ts`, `server/tests/analytics.test.ts`

**Requires review:** false

Replace `const country = await resolveCountry(req.ip)` with `const { country, region } = await resolveLocation(req.ip)`. Add `region` to the `INSERT INTO events (...)` column list and bound values (immediately after `country`, matching column order elsewhere in this file).

**Acceptance criteria:**
- [ ] A stubbed/faked GeoIP reader resolving both fields results in an `events` row with `region` populated correctly for at least one event type (mirror the existing `country`-assertion tests' structure).
- [ ] When GeoIP is unconfigured (the existing default test environment), `region` is `NULL`, same as `country` already is — no existing `analytics.test.ts` case should need behavioral changes beyond whatever the shared helper renames require.
- [ ] `make test` (server) passes.

---

### Step 4: Add the `regions` breakdown

**Files:** `server/src/routes/admin/analytics.ts`, `server/src/types.ts`, `client/src/types.ts`, `server/tests/admin-analytics.test.ts`

**Requires review:** false

Add `regions: breakdownFor(app, 'region', ws)` to the `breakdowns` object literal in `GET /admin/analytics/breakdowns`. Add `regions: { key: string; count: number }[]` to the `AnalyticsBreakdowns` interface in both `server/src/types.ts` and `client/src/types.ts`, placed after `countries` (matching the field's conceptual place next to it).

**Acceptance criteria:**
- [ ] `GET /admin/analytics/breakdowns` response includes a `regions` array, grouped/ordered identically to how `countries` already behaves (page_view-scoped, window-scoped, `count DESC`).
- [ ] Rows with `region IS NULL` are excluded from the breakdown, matching every other `breakdownFor` column's existing behavior.
- [ ] `make test` (server) passes.

---

### Step 5: Swap the GeoIP data source to City-tier, update docs

**Files:** `scripts/fetch-geoip-db.sh`, `README.md` (wherever `GEOIP_DB_PATH` / GeoIP setup is documented), `.env.example` if it mentions the file

**Requires review:** true — changes what an operator downloads and runs against production; worth a deliberate look given the memory-footprint and accuracy tradeoffs from Context.

Update the script to fetch DB-IP's free City Lite `.mmdb.gz` instead of Country Lite (same CC BY 4.0 attribution requirement, same monthly-release/fallback-to-previous-month logic the script already has — verify the exact current DB-IP City Lite URL/filename pattern at implementation time, since Step Context's URL guess is not itself verified). Update the script's own header comment and any README/`.env.example` prose describing what the downloaded file contains, to mention region/state breakdowns are now included and to carry forward the two Context tradeoffs (file size / memory footprint; state-level accuracy is lower than country-level) into operator-facing docs so this isn't a silent behavior change for anyone who re-reads the setup docs later. Existing deployments must re-run `fetch-geoip-db.sh` to pick up the new file at their already-configured `GEOIP_DB_PATH` — this is not automatic, and should be called out explicitly in whatever changelog/release note accompanies this ship (not a code change, a deployment-runbook note).

**Acceptance criteria:**
- [ ] Script downloads a City-tier file, still with zero required local setup beyond `curl` (no signup/API key), still monthly-release-aware with the current-month/fallback-to-previous-month logic intact.
- [ ] Script's own header comment and relevant docs accurately describe the new file's contents and size/accuracy tradeoffs.
- [ ] Running the updated script against a scratch destination produces a file `geoip.ts`'s `Reader<CityResponse>` can actually open (manual smoke check, not an automated test — this script has no existing test coverage and this plan doesn't add any, consistent with its current untested status).

---

### Step 6: Admin dashboard UI

**Files:** `client/src/pages/admin/AdminAnalytics.tsx`, `client/src/tests/AdminAnalytics.test.tsx`

**Requires review:** false

Add `<BreakdownList title="Regions" rows={breakdowns.regions} />` alongside the existing five `<BreakdownList>` calls (placed directly after `Countries`, matching Step 4's interface field placement). Update the two full `AnalyticsBreakdowns` literals in the test file (`breakdownsWithData`, `emptyBreakdowns`) to include a `regions` field — `emptyBreakdowns` gets `regions: []`; `breakdownsWithData` gets a small representative sample (e.g. `[{ key: 'US-CA', count: 4 }]`).

**Acceptance criteria:**
- [ ] "Regions" breakdown card renders with the same empty/loading/populated states the other five already handle correctly (no new state logic needed — confirm the existing generic handling covers it, don't add region-specific branching).
- [ ] Both updated test literals compile and the existing loading/empty/populated `AdminAnalytics.test.tsx` cases still pass.
- [ ] `make test` (client) passes; `npx tsc --noEmit` clean.

---

### Step 7: Full quality gate

**Files:** none (verification only)

**Requires review:** false

Run `make test`, `make lint`, and (from `client/`) `npx tsc --noEmit`.

**Acceptance criteria:**
- [ ] `make test` fully green (server + client).
- [ ] `make lint` clean.
- [ ] `tsc --noEmit` clean.

## Testing

Server-side: extensions to `migrate.test.ts` (Step 1), `geoip.test.ts` (Step 2 — the highest-value tests here, since this is genuinely new resolution logic, not just plumbing), `analytics.test.ts` (Step 3), `admin-analytics.test.ts` (Step 4). Client-side: extensions to `AdminAnalytics.test.tsx` (Step 6) for the two literal-shape fixes plus the new card's rendering. No e2e coverage planned, consistent with plan 015's precedent — GeoIP resolution and breakdown aggregation are server-level concerns not meaningfully exercised through a browser e2e test, and the existing e2e suite has no GeoIP-dependent specs today.

## Notes

- **Alternative considered and rejected:** a paid/precise geolocation provider (MaxMind GeoLite2-City requires a free account + license key at minimum; commercial providers offer better accuracy at real cost). Rejected for the same reason plan 001 originally chose DB-IP over MaxMind: this project's explicit "works vanilla, zero required external accounts" goal (see plan 001's Summary) — DB-IP's free City Lite tier is the only option that preserves "add an env var and run one unauthenticated curl script" as the entire setup story. An operator who wants better accuracy can already point `GEOIP_DB_PATH` at a different `.mmdb` file of their own sourcing — nothing in this plan forecloses that.
- **Alternative considered and rejected:** deriving region from the browser (e.g. `Intl.DateTimeFormat().resolvedOptions().timeZone` as a proxy, or a client-side geolocation API prompt). Rejected — the former is a poor proxy for state/province (time zones span multiple states and vice versa) and the latter requires an intrusive permission prompt for what's meant to be passive, first-party analytics; server-side IP resolution is consistent with how `country` already works and requires zero listener-facing UI or consent flow beyond what's already disclosed in `PrivacyNotice`.
- This plan does not touch `PrivacyNotice.tsx`'s disclosure text, which already says analytics includes "a country resolved from your IP address" — that copy should arguably be updated to mention region too when this ships, but is deliberately left out of this plan's steps since it's a one-line follow-up better bundled with whichever step actually flips the feature on, not speculatively written against an unmerged plan.
