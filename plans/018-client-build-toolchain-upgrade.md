---
id: client-build-toolchain-upgrade
title: "Upgrade Vite/Vitest/plugin-react to resolve 9 client devDependency CVEs"
status: complete
priority: 2
created: 2026-09-12
steps_completed: 5
steps_total: 5
tags: [security, dependencies, vite, vitest, client]
---

# Upgrade Vite/Vitest/plugin-react to Resolve Client DevDependency CVEs

## Summary

Fixes 9 of the 10 client-side devDependency vulnerabilities found as a follow-up to `plans/017` (which already fixed the two production CVEs) — a coupled `vite` 5→8, `vitest` 3→5, and `@vitejs/plugin-react` 4→6 upgrade, all confirmed necessary together, not independently choosable. The 10th vulnerability (`postcss-selector-parser`, low severity, via `tailwindcss`) is explicitly out of scope — see Notes.

## Context

**Why this is one coupled upgrade, not three independent ones:** `vitest@latest`'s own peer dependency is `vite: ^6.4.0 || ^7.0.0 || ^8.0.0` — it no longer supports Vite 5.x at all, so fixing the critical Vitest CVE (needs `vitest >= 5.0.0`, confirmed via `npm audit`'s suggested fix target) *requires* the Vite major bump as a prerequisite. Separately, `@vitejs/plugin-react@latest`'s peer dependency is `vite: ^8.0.0` only — its current major line no longer supports Vite 5/6/7, so it must move to its own latest major (currently `6.x`) in the same pass. Currently declared: `client/package.json` has `vite: ^5.1.0` (installed: `5.4.21`, already the latest 5.x), `@vitejs/plugin-react: ^4.2.1`, `vitest: ^3.0.0`; `server/package.json` separately has `vitest: ^3.0.0` (server's own devDependency, unrelated to the client bundler but needing the same version bump for the same underlying CVE).

**What's fixed:** the critical (`vitest` — arbitrary file read via the Vitest UI server, exploitable only if a contributor runs `vitest --ui` and exposes it), all 4 high-severity (`browserslist` ×2, `js-yaml`, `brace-expansion` — all transitive under `vite`/`esbuild`), and the remaining moderate/low ones transitively resolved by the same dependency-tree update (`esbuild`, `baseline-browser-mapping`, `@babel/core`). Confirmed via `npm audit` in `client/` before starting this plan: 10 total (2 low, 3 moderate, 4 high, 1 critical); this plan is expected to leave exactly 1 (the carved-out `postcss-selector-parser`).

**Research already done, confirming this is lower-risk than a 3-major-version jump usually implies — verify these hold at execution time, don't re-derive from scratch:**
- **Node.js**: `vite@8.3.0` requires `node ^20.19.0 || >=22.12.0`; `vitest@5.0.0` requires specifically `node >= 22.12.0`. Checked directly: the production Docker image (`node:22-alpine`, digest-pinned in the root `Dockerfile`) resolves to `v22.23.2`; CI (`.github/workflows/ci-cd.yml`, `node-version: '22'`) will resolve to a current 22.x, comfortably above 22.12.0. **Client tests run via `make test` → `cd client && npm test`, directly on the host/CI runner — never inside `client/Dockerfile.dev`'s container** (confirmed via the `Makefile`), so that container's Node 20.20.2 (which satisfies Vite's own 20.19+ floor but not Vitest 5's stricter 22.12+-only floor) is irrelevant to test execution; it's only used for `npm run dev` (the Vite dev server), which Vite 8 itself is fine with.
- **Vite config compatibility**: checked the official migration guides for 5→6, 6→7, and 7→8 against this repo's actual `client/vite.config.ts` (minimal: `@vitejs/plugin-react`, a `server.proxy` block for `/api`/`/audio`/`/images`, and a `test` block for Vitest). None of the documented breaking changes apply: no `server.proxy[path].bypass` usage (the one proxy-related change, v6), no Sass usage (the Sass-API changes don't apply), no `splitVendorChunkPlugin` or `transformIndexHtml` hook usage (removed in v7), no custom `build.rollupOptions`/`worker.rollupOptions` (renamed in v8). The only concretely-relevant v6 note: PostCSS config files written in TypeScript now need `tsx`/`jiti` instead of `ts-node` to load — this repo's `client/postcss.config.js` is plain JS, not TS, so this doesn't apply either.
- **Vitest breaking changes (3.x → 5.0)**: checked the official migration guide. `vi.mock()` calls inside a function/block/`describe`/`test` callback now *throw* instead of warn — grepped every test file in both `client/src/tests/` and `server/tests/` for non-top-level `vi.mock(` calls: **zero found**, all existing usages are already correctly hoisted. The one real, non-zero-risk item: Vitest 5 changes jsdom/happy-dom so "assignments to properties on `globalThis`/`window` ... are now propagated to the underlying DOM implementation" — `client/src/tests/setup.ts` does exactly this kind of thing (`window.matchMedia = ...`, `window.ResizeObserver = ...`, `Object.defineProperty(globalThis, 'localStorage', ...)`, a patched `HTMLMediaElement.prototype.src` setter). This is the single most likely source of any real fallout from this upgrade — Step 3 exists specifically to catch and fix it if it happens, not to assume it won't.

**Files involved:** `client/package.json`, `client/package-lock.json`, `server/package.json`, `server/package-lock.json`, and — only if Step 3's live test run surfaces a real regression — `client/src/tests/setup.ts` and/or `client/vite.config.ts`.

## Steps

### Step 1: Bump vite, vitest, and @vitejs/plugin-react together

**Files:** `client/package.json`, `client/package-lock.json`, `server/package.json`, `server/package-lock.json`

**Requires review:** true — a three-major-version jump to the client's core build/test tooling; despite the research above suggesting low practical risk for this repo's specific config, this is exactly the kind of higher-blast-radius, judgment-informed change that deserves a deliberate look before and after, not a blind bump.

In `client/`:
```bash
npm install vite@latest @vitejs/plugin-react@latest vitest@latest
```
In `server/`:
```bash
npm install vitest@latest
```
As of this plan's research, `@latest` resolves to `vite@8.3.0`, `@vitejs/plugin-react@6.1.1`, `vitest@5.x` — confirm at execution time these (or newer non-vulnerable patches within the same majors) are what actually gets installed; do not manually pin to today's exact patch numbers if `@latest` has moved on.

**Acceptance criteria:**
- [ ] `client/package.json` declares `vite`, `@vitejs/plugin-react`, and `vitest` at their new major versions (8.x, 6.x, 5.x respectively, or newer).
- [ ] `server/package.json` declares `vitest` at 5.x or newer.
- [ ] Both lockfiles updated accordingly.
- [ ] `npm audit` in `client/` no longer reports `vite`, `esbuild`, `js-yaml`, `browserslist`, `brace-expansion`, `@babel/core`, or `baseline-browser-mapping` — only `postcss-selector-parser` (carved out, see Notes) should remain.
- [ ] `npm audit` in `server/` no longer reports `vitest`/`@vitest/mocker`.

---

### Step 2: Confirm the client still builds

**Files:** none (verification only)

**Requires review:** false

Before running any tests, confirm the bundler itself still works end-to-end: run a production build (`cd client && npm run build`, or `npx vite build`) and confirm it completes without error and produces the expected `dist/` output. This isolates "does Vite 8 itself work with this config" from "do the tests pass," so a build failure and a test failure don't get conflated if something does go wrong.

**Acceptance criteria:**
- [ ] `client`'s production build completes successfully with no new errors/warnings beyond what already existed pre-upgrade.
- [ ] `dist/` output is produced (spot-check it exists and contains the expected `index.html`/asset files).

---

### Step 3: Run the full test suite and fix any real fallout

**Files:** `client/src/tests/setup.ts` (only if needed — see Context), `client/vite.config.ts` (only if needed)

**Requires review:** false — this step is about reacting to what the test run actually shows, not making a new architectural choice; if something big enough to need review turns up, stop and surface it rather than silently deciding.

Run `make test` (both `server/` and `client/`). If anything fails, investigate `client/src/tests/setup.ts` first (per Context, the jsdom/happy-dom global-propagation change is the most likely source) — a failure there would likely manifest as `matchMedia`/`ResizeObserver`/`localStorage`/`HTMLMediaElement` mocks in many otherwise-unrelated test files failing in a similar way, not one isolated test. Fix forward (adjust the mock to work correctly under the new behavior) rather than working around symptoms in individual test files.

**Acceptance criteria:**
- [ ] `make test` fully green: server's full suite (268 tests as of `plans/017`) and client's full suite (446 tests + 1 skipped as of this plan) all pass, unchanged in count unless a genuine, explained adjustment was needed.
- [ ] If `setup.ts` or `vite.config.ts` needed changes, they're documented here in this step's own summary (what broke, why, what changed) — not silently fixed with no record.

---

### Step 4: Live-verify the dev server and mobile/desktop UI still work

**Files:** none (verification only)

**Requires review:** false

Per this repo's own established practice for UI/build-affecting changes, don't rely on unit tests alone. Run `make up`, confirm the client dev server starts cleanly under the new Vite major, confirm hot-reload still works (edit a component, confirm the browser updates without a full reload), and do a quick pass through the listener UI at both a desktop and mobile viewport width to confirm nothing about the built output looks or behaves differently.

**Acceptance criteria:**
- [ ] `make up` starts cleanly, no new errors in `make logs`.
- [ ] A live edit to a component hot-reloads correctly in the browser.
- [ ] Listener UI spot-checked at desktop and mobile widths, no visual/behavioral regression.

---

### Step 5: Full quality gate

**Files:** none (verification only)

**Requires review:** false

Run `make test`, `make lint`, and (from `client/`) `npx tsc --noEmit`. Re-run `npm audit` in both `server/` and `client/` as final confirmation of the fixed scope.

**Acceptance criteria:**
- [ ] `make test`, `make lint`, `tsc --noEmit` all green.
- [ ] `client/`'s `npm audit` shows exactly one remaining vulnerability (`postcss-selector-parser`, carved out — see Notes), down from 10.
- [ ] `server/`'s `npm audit` shows zero vulnerabilities (the `vitest`/`@vitest/mocker` one from before this plan is now fixed; the `fastify`/`sharp` ones were already fixed by `plans/017`).

## Testing

This plan's entire purpose is dependency-version hygiene with no intentional behavior change — the existing 268 server + 446 client tests *are* the test plan. Step 2 isolates build-tool correctness from test correctness; Step 3 is where any real fallout gets caught and fixed; Step 4 is the live-UI check this repo's own conventions call for on anything touching the client build pipeline, even though no application code is expected to change.

## Notes

- **`postcss-selector-parser` (low severity, via `tailwindcss@3.4.19`) is deliberately out of scope**, per explicit decision during this plan's drafting. The real fix requires `postcss-selector-parser@7.x`, which `tailwindcss` doesn't pull in until its own v4 — a CSS-based-config rewrite (replacing `tailwind.config.ts`'s JS/TS theme object with `@theme` in CSS) that's a fundamentally different, much larger-blast-radius kind of change than a build-tool version bump, disproportionate to fixing one low-severity, build-time-only, dev-only advisory. An `npm overrides` force-fix was considered and also rejected for now (untested-by-Tailwind's-own-maintainers risk of subtly broken class generation, needing its own dedicated visual-regression pass) — revisit either approach as its own separate, deliberate decision if/when it's actually prioritized.
- **Why one combined dependency-bump step, not three separate ones (vite, then plugin-react, then vitest):** they are not independently valid intermediate states — `@vitejs/plugin-react@latest` only works with `vite@^8.0.0`, and `vitest@latest` only works with `vite@^6.4.0` or newer. Bumping them one at a time would pass through broken intermediate states for no benefit, since none of them are being *kept* at an intermediate version.
- **Why Step 1 alone gets a review gate, not every step:** the review-worthy decision is "should we actually do this 3-major-version jump" — once that's approved, Steps 2-5 are verification and fix-forward, not further architectural choices.
