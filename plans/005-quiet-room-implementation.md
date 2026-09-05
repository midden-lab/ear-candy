---
id: quiet-room-implementation
title: "Implement the Quiet Room design system in the real client app"
status: in-progress
priority: 1
created: 2026-09-05
steps_completed: 6
steps_total: 10
tags: [redesign, quiet-room, frontend, ux, design-system, mobile]
---

# Implement the Quiet Room design system in the real client app

## Summary

Builds the "Quiet Room" design direction (recorded as a reference in `plans/004-quiet-room-design-system.md`) into the real Ear Candy client: a neutral-scale design-token layer, Archivo/IBM Plex Mono typography, a season selector that scales past a handful of seasons (dropdown+search on desktop, a full-screen picker on mobile), a relocated share control, a reworked mobile "Playing" tab that opens the same episode view used everywhere else (rather than a bespoke overlay), and an active-row indicator that no longer relies on a border. Listener-facing only — the admin panel is out of scope.

## Context

**Read `plans/004-quiet-room-design-system.md` first.** It is the design rationale this plan implements; this plan does not re-derive *why*, only *how*, against the code as it exists today.

**Real codebase, as read directly (not as `plans/004` described it — one correction below):**
- `client/src/App.tsx` — owns `viewingEpisode` (`useState`) and `focusedPane: 'list' | 'detail' | 'settings'`, kept independent of `usePlayerStore()`'s `episode`/`playing` per the viewing/playing decoupling rule. Composes `AppShell` with `rail`/`sidebar`/`detail`/`settings`/`tabBar`/`player` slots. `handlePlayEpisode(ep)` is the only path that changes what's loaded in the player.
- `client/src/components/AppShell.tsx` — desktop shows `sidebar` + `detail` side by side; mobile shows exactly one of `sidebar`/`settings`/`detail` based on `focusedPane`, plus a fixed `tabBar`.
- `client/src/components/MobileTabBar.tsx` — **already has a three-item tab bar with a "Playing" label**, but it does not behave anything like the design system: `MobileTab` type is `'episodes' | 'settings'` (no `'playing'` value — the Playing button never sets `activeTab`), the button is `disabled={!hasPlayerEpisode}`, it uses an icon (`TabIcon`, a circle+triangle glyph) which conflicts with the "no icons outside transport" principle, and its handler (`onExpandPlayer`) bumps `expandSignal`, which opens `AudioPlayerView`'s own full-screen overlay — a different, and about-to-be-retired, code path from the unified episode view this plan wires the tab to instead.
- `client/src/components/SeasonTabs.tsx` — desktop-only flat horizontal button row (`overflow-x-auto`), rendered from `EpisodeListView.tsx`'s desktop branch.
- `client/src/components/SeasonChip.tsx` — **mobile's existing season selector, not previously identified in `plans/004`.** It is already a dropdown (`aria-haspopup="listbox"`, an absolutely-positioned `<ul role="listbox">` under the trigger chip), not a flat row. This is exactly the desktop-native modality `plans/004` says doesn't work at mobile scale (viewport/touch-target constraints, no "how many seasons exist" affordance) — it needs replacing with a full-screen picker, not introducing one from nothing. Rendered from `EpisodeListView.tsx`'s mobile branch.
- `client/src/components/EpisodeListView.tsx` — pure, store-agnostic season/episode browser; branches on `useBreakpoint(MD_BREAKPOINT_QUERY)` to pick `SeasonTabs` vs. `SeasonChip`.
- `client/src/components/DetailPane.tsx` — episode metadata + a single Play/Pause/Retry button. No scrub bar, no skip, no speed control today — those exist only inside `AudioPlayerView.tsx`.
- `client/src/components/AudioPlayerView.tsx` — owns the real `<audio>` element. Renders three ways: mobile mini-bar (collapsed), mobile full-screen "now playing" overlay (`expanded` state, toggled by `expandSignal` prop or tapping the mini-bar), or desktop bar. `TransportControls` (scrub-adjacent skip/play/skip/speed row) is a **local, unexported** function in this file — not reusable from `DetailPane` as-is. `ShareDialog` is rendered from two places in this file: the desktop bar, and the mobile full-screen overlay.
- `client/src/components/ShareDialog.tsx` — self-contained trigger + portaled dialog; the dialog itself needs no changes, only where its trigger is rendered from.
- `client/src/components/EpisodeItem.tsx` — active-row state is `border-l-2 border-[var(--accent)]` plus a background tint — the border is exactly what `plans/004`'s "no added borders" principle flags as a pre-existing conflict.
- `client/src/store/playerStore.ts` (Zustand) — `episode, playing, currentTime, duration, speed, loading, error, retryNonce` plus setters. Global, already used by both `AudioPlayer.tsx` and (for read-only badges) `EpisodeList.tsx`.
- `client/src/hooks/useTheme.ts` — sets `--accent`/`--accent-contrast` on `documentElement` from `settings.accent_color` (admin-configurable), independent of light/dark. Dark mode toggled via a `.dark` class on `documentElement`, default dark unless `localStorage.theme === 'light'`.
- `client/src/utils/color.ts` — `getContrastTextColor(hex)` (WCAG-luminance black/white pick) is the existing pattern for accent-derived color utilities; a new dark-mode accent helper belongs here, same shape.
- `client/src/index.css` — Tailwind directives + `:root` tokens today limited to `--accent`, `--accent-contrast`, `--player-h`, `--tabbar-h`. No neutral-scale tokens; every component hardcodes Tailwind's `zinc-*` classes directly.
- `client/tailwind.config.ts` — `theme: { extend: {} }`, no customization at all today.
- `client/index.html` — no fonts loaded; the app currently renders in the browser default sans-serif.
- `server/src/routes/episodes.ts` / `client/src/api.ts`'s `getEpisodes(seasonId?: number)` — **`GET /api/episodes` with no `season_id` already returns every visible episode across every season, in one call.** Cross-catalog search and per-season counts can both be built entirely client-side from this one existing endpoint — no server or API change is needed anywhere in this plan.
- Ear Candy is a self-hostable, soon-to-be-open-sourced app with a stated no-third-party-network-calls posture for listener-facing behavior (see `plans/001-first-party-analytics.md`'s framing). Loading fonts from a Google Fonts `<link>` would put a third-party network call in front of every page view of every self-hosted deployment — this plan self-hosts the font files instead.

**Explicitly out of scope for this plan** (per `plans/004`, confirmed unchanged):
- Admin panel — no changes anywhere under `client/src/pages/admin/`.
- A full app-wide sweep of every remaining `zinc-*` class to the new tokens — this plan tokens only the components it touches for other reasons in Steps 4–10; a repo-wide sweep is large enough to be its own follow-up plan (see Notes).
- Any new server/API endpoint — confirmed unnecessary (see `getEpisodes` finding above).
- An accessibility audit beyond preserving/improving on `MobileTabBar.tsx`'s existing tested `aria-current` conventions.

**Quality gate — required for every step, not just Step 10.** This plan touches several of the most heavily-tested files in the client package (`DetailPane.test.tsx`: 19+ existing cases, `AudioPlayerView.test.tsx`: 46, `MobileTabBar.test.tsx`, `SeasonTabs.test.tsx`, `EpisodeItem.test.tsx`), and several steps deliberately change behavior those existing tests were written to lock in (the border-based active row, the disabled Playing tab, `onExpandPlayer`, the flat season row). That is expected, not a warning sign — but it means "the tests still pass" is not automatically true after any of these steps, and is not optional:

- **Existing tests that assert now-obsolete behavior must be refactored or rewritten in the same step that changes the behavior** — never left red, never deleted without a replacement assertion for the new behavior, and never skipped/`.todo`'d to keep the suite green artificially. The Testing section below names the specific existing test cases each step invalidates.
- **New behavior introduced by a step ships with test coverage in that same step**, not deferred to a later cleanup pass — the Testing section below also names the new coverage each step requires.
- **`cd client && npm test`, `npm run typecheck`, and `npm run lint` must all pass, in full, before a step is considered done** — each step's acceptance criteria includes this explicitly so it isn't implicit or easy to skip. Step 10 exists as a final repo-wide confirmation and orphaned-reference sweep, not as the only point in the plan where this is actually checked.

## Steps

### Step 1: Design tokens — neutral-scale palette + dark-mode-safe accent

**Files:** `client/src/index.css`, `client/tailwind.config.ts`, `client/src/utils/color.ts`, `client/src/hooks/useTheme.ts`
**Requires review:** true

Add the Quiet Room neutral-scale tokens as CSS custom properties in `client/src/index.css`, light values on `:root`, dark overrides under the existing `.dark` selector convention:

```css
:root {
  --canvas: #EEEFF0; --surface: #FFFFFF;
  --ink: #121316; --ink-2: #5B5E64; --ink-3: #8E9197; --ink-4: #B4B7BC;
}
.dark {
  --canvas: #121014; --surface: #1B1920;
  --ink: #F1EFF3; --ink-2: #A9A6AF; --ink-3: #75727A; --ink-4: #4C4A51;
}
```

Extend `client/tailwind.config.ts`'s `theme.extend.colors` so these are usable as ordinary Tailwind utilities (`bg-canvas`, `bg-surface`, `text-ink`, `text-ink-2`, `text-ink-3`, `text-ink-4`) rather than only via arbitrary-value syntax:

```ts
theme: {
  extend: {
    colors: {
      canvas: 'var(--canvas)', surface: 'var(--surface)',
      ink: 'var(--ink)', 'ink-2': 'var(--ink-2)', 'ink-3': 'var(--ink-3)', 'ink-4': 'var(--ink-4)',
    },
  },
},
```

`--accent`/`--accent-contrast` are admin-configurable and must keep working exactly as today for any color the admin picks — do not hardcode the mockup's fixed purple dark-mode value (`#B583FF`) anywhere, since that's only correct for that one purple. Instead, add a general dark-mode-safe lightening function to `client/src/utils/color.ts`, next to `getContrastTextColor`:

```ts
/** Lightens an arbitrary accent color for use against a dark canvas, so an
 *  admin-chosen accent that's readable on a light background (e.g. a
 *  saturated purple or blue) doesn't lose contrast once the canvas goes
 *  dark. Converts to HSL, raises lightness to at least 65%, clamped to 85%
 *  so an already-light accent isn't pushed toward white. */
export function getDarkModeAccent(hex: string): string
```

Implement via hex→HSL→hex round-trip (raise `L` to `Math.min(0.85, Math.max(l, 0.65))`, keep `H`/`S`). Update `useTheme.ts`'s effect so it sets `--accent` to `accentColor` in light mode and to `getDarkModeAccent(accentColor)` in dark mode (the effect already re-runs on `accentColor` change; it now also needs to depend on `isDark` and re-run on theme toggle, not just on mount/accent change).

Caveat this formula honestly at review, don't just trust it blind: for an *already-light* accent (e.g. a neon green at `L≈0.90`), the clamp actually pulls it down to `0.85` — a slight darkening, the opposite of what the function's name implies, though small enough (0.90→0.85) to likely be a non-issue in practice. Separately, a very dark, saturated input (e.g. a navy) jumped straight to `L 0.65–0.85` can land as a washed-out pastel that no longer separates cleanly from `--ink-3`/`--ink-4`. Eyeball a few real admin-style swatches at both extremes during review, not just the one purple example above.

**Acceptance criteria:**
- [ ] `:root` and `.dark` define all six neutral tokens with the exact hex values above.
- [ ] `bg-canvas`/`bg-surface`/`text-ink`/`text-ink-2`/`text-ink-3`/`text-ink-4` are valid Tailwind classes (verified by using one in a throwaway component and confirming it compiles/renders with the right computed color in both themes).
- [ ] `getDarkModeAccent('#5a3ef5')` returns a lighter purple with HSL lightness in `[0.65, 0.85]`; `getDarkModeAccent('#ffef00')` (already very light) is not pushed past 0.85 lightness.
- [ ] Toggling dark mode while an episode's accent-colored button is visible updates its color live, without a page reload.
- [ ] Existing `getContrastTextColor` tests still pass unmodified; new tests cover `getDarkModeAccent` (see Testing).
- [ ] `cd client && npm test`, `npm run typecheck`, and `npm run lint` all pass with this step's changes in place (see Quality gate in Context).

---

### Step 2: Self-hosted Archivo + IBM Plex Mono

**Files:** `client/public/fonts/` (new woff2 files), `client/src/index.css`, `client/tailwind.config.ts`
**Requires review:** true

Download Archivo (variable or a small static weight set — 400/500/600 is enough for this app's usage) and IBM Plex Mono (400/500) as `.woff2` files, place them under `client/public/fonts/` (Vite serves `public/` at the site root, so `/fonts/archivo-400.woff2` etc. resolve directly — no bundler config needed). Both are open-source (SIL OFL) and safe to redistribute; note the license file's presence in the same directory (`client/public/fonts/LICENSE-OFL.txt`) as part of this step, not left implicit.

Add `@font-face` declarations to `client/src/index.css` (above the existing `:root` block), then extend `client/tailwind.config.ts`'s `theme.extend.fontFamily`:

```ts
fontFamily: {
  sans: ['Archivo', 'ui-sans-serif', 'system-ui', 'sans-serif'],
  mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
},
```

Apply `font-sans` at the `body` level in `index.css` (alongside the existing `bg-zinc-50 dark:bg-zinc-950` rule, to be replaced with `bg-canvas dark:bg-canvas` — canvas already flips via the `.dark` selector, so no `dark:` variant is actually needed once Step 1's tokens are in place; simplify to `bg-canvas text-ink`). Do not apply `font-mono` globally — it's for numeric/mono data (episode numbers, timestamps, durations, season counts) applied per-element in later steps, matching `plans/004`.

**Acceptance criteria:**
- [ ] Archivo renders as the default UI font in both themes (spot-check via computed `font-family` in devtools).
- [ ] IBM Plex Mono is available as `font-mono` but not applied anywhere yet by this step alone.
- [ ] `client/public/fonts/LICENSE-OFL.txt` (or equivalent) is present and committed alongside the font files.
- [ ] `body` uses `bg-canvas text-ink` instead of the old hardcoded `zinc-*` pair; app renders with no visual regression outside of the font/color swap itself.
- [ ] No network request to any external font host appears in the browser's network tab on page load.
- [ ] `cd client && npm test`, `npm run typecheck`, and `npm run lint` all pass with this step's changes in place (see Quality gate in Context).

---

### Step 3: Shared all-episodes data layer + cross-catalog search

**Files:** `client/src/App.tsx`, `client/src/utils/search.ts` (new), `client/src/components/EpisodeList.tsx`, `client/src/components/EpisodeListView.tsx`
**Requires review:** true

`App.tsx` fetches `getEpisodes()` with **no** `season_id` argument once at boot (alongside the existing `getSeasons()` call), storing the result as new state `allEpisodes: Episode[]`. This is the one call that returns every visible episode across every season — confirmed directly against `server/src/routes/episodes.ts`, no new endpoint needed. Fetch eagerly at boot (not lazily on first search) — for a podcast archive's episode count (tens to a few hundred rows), the payload is small enough that eager fetch avoids extra loading-state plumbing in the search UI itself; note the lazy alternative in Notes if a deployment's catalog ever grows large enough to reconsider.

Add `client/src/utils/search.ts`:

```ts
export interface SearchResult { episode: Episode; seasonId: number }

/** True if `query` (already trimmed, lowercased by the caller) appears in
 *  the episode's title or its comma-separated guest list. */
export function matchesEpisodeQuery(episode: Episode, query: string): boolean

/** Flattens `episodes` across all seasons and returns every match for
 *  `query`, each tagged with its origin season id for an inline "S9"-style
 *  label. Empty/whitespace-only query returns an empty array (the caller
 *  is expected to fall back to season-scoped browsing in that case, not
 *  call this at all). */
export function searchAllEpisodes(episodes: Episode[], query: string): SearchResult[]
```

Add a `searchQuery: string` state to `App.tsx` (or, if cleaner given `EpisodeList.tsx`'s existing "thin store-connector" role, lift it into `EpisodeList.tsx` instead — either is acceptable, but keep the query and its clearing logic in exactly one place). Thread `allEpisodes`, `searchQuery`, and an `onSearchChange` handler down through `EpisodeList.tsx` into `EpisodeListView.tsx`. `EpisodeListView.tsx` renders a single search `<input>` (new — no existing search UI anywhere) above the season selector, in both its desktop and mobile branches (same input, not two separate ones — `EpisodeListView` already branches on `isDesktop` only for layout, not for behavior). When `searchQuery` is non-empty, `EpisodeListView` renders `searchAllEpisodes(allEpisodes, searchQuery)` results (each row showing a small inline season tag, `font-mono`, e.g. "S9") instead of the season-scoped `episodes` prop; clearing the query reverts to normal season-scoped browsing. Selecting a season (via Steps 4/5's selectors) also clears `searchQuery`, matching the mockup's behavior.

**Acceptance criteria:**
- [ ] `allEpisodes` is fetched once at boot and contains every visible episode regardless of season.
- [ ] Typing in the search box filters the visible list to title/guest matches across all seasons, each tagged with its season.
- [ ] Clearing the search box reverts to the currently-active season's episode list.
- [ ] Selecting a different season while a search is active clears the search and returns to season-scoped browsing.
- [ ] `matchesEpisodeQuery`/`searchAllEpisodes` have unit tests covering case-insensitivity, guest-list matching, and empty-query behavior.
- [ ] `cd client && npm test`, `npm run typecheck`, and `npm run lint` all pass with this step's changes in place (see Quality gate in Context).

---

### Step 4: Desktop season selector — dropdown/popover with counts

**Files:** `client/src/components/SeasonTabs.tsx`, `client/src/components/EpisodeListView.tsx`
**Requires review:** false

Rewrite `SeasonTabs.tsx` from a flat button row into a fixed-width trigger (`"{active season title} ▾"`) that opens a `role="listbox"` popover listing every season with its episode count (derived by counting `allEpisodes` by `season_id`, passed in as a new prop — `EpisodeListView.tsx` computes counts once and passes a `Map<number, number>` or plain `{ [seasonId]: number }` down, rather than `SeasonTabs` recomputing it). Use the new tokens: `bg-surface` for the popover, `text-ink`/`text-ink-3` for label/count text, `text-[var(--accent)]` (existing mechanism, unchanged) for the selected option — no border on the popover itself beyond whatever shadow utility already exists in the codebase for elevated surfaces (check `ShareDialog.tsx`'s modal panel for the existing shadow convention: `shadow-xl`, reuse it). Close on outside click and Escape, matching `SeasonChip.tsx`'s existing outside-click pattern (reuse that `useEffect` shape rather than inventing a new one).

`EpisodeListView.tsx`'s desktop branch renders this new trigger+popover in place of the old flat row; no other desktop layout changes.

**Acceptance criteria:**
- [ ] Trigger shows the active season's title and a caret; popover lists every season with its episode count.
- [ ] Clicking a season selects it, closes the popover, and (per Step 3) clears any active search.
- [ ] Popover closes on outside click and on Escape.
- [ ] Popover and options are reachable via keyboard (Tab to trigger, Enter/Space to open, arrow keys or Tab through options — match whatever level `SeasonChip.tsx` already achieves at minimum, do not regress).
- [ ] `SeasonTabs.test.tsx` is rewritten for the new markup (see Testing).
- [ ] `cd client && npm test`, `npm run typecheck`, and `npm run lint` all pass with this step's changes in place (see Quality gate in Context).

---

### Step 5: Mobile season selector — full-screen picker

**Files:** `client/src/components/SeasonPicker.tsx` (new), `client/src/components/SeasonChip.tsx` (deleted), `client/src/components/EpisodeListView.tsx`
**Requires review:** false

Delete `SeasonChip.tsx` and replace it with a new `client/src/components/SeasonPicker.tsx`: a compact trigger button (visually similar to today's chip — keep the pill shape, label, and caret) that opens a full-screen overlay, portaled to `document.body` via `createPortal` (same pattern as `ShareDialog.tsx`, not an absolutely-positioned dropdown like the component it replaces — a portal avoids any clipping/z-index issue from whatever scroll container the trigger lives inside). The overlay is `position: fixed; inset: 0`, `bg-canvas`, with a top-left close button (an "×" glyph, matching the small-utility-glyph allowance, not a navigational icon) and a scrollable `role="listbox"` list of every season with its count (same count data as Step 4, passed down alongside seasons), each row a large (≥44px) touch target, selected season shown via `text-[var(--accent)]` + weight only — no border. Selecting a season closes the overlay and (per Step 3) clears any active search. Lock body scroll while open, matching `ShareDialog.tsx`'s existing `document.body.style.overflow = 'hidden'` pattern.

`EpisodeListView.tsx`'s mobile branch renders `SeasonPicker` in place of `SeasonChip`.

**Acceptance criteria:**
- [ ] Tapping the trigger opens a full-screen overlay (not an anchored dropdown), listing every season with its count.
- [ ] Tapping a season selects it and closes the overlay; tapping the close button or pressing Escape closes it without changing the selection.
- [ ] Body scroll is locked while the overlay is open.
- [ ] `SeasonChip.test.tsx` is deleted; a new `SeasonPicker.test.tsx` covers the above.
- [ ] `cd client && npm test`, `npm run typecheck`, and `npm run lint` all pass with this step's changes in place (see Quality gate in Context).

---

### Step 6: Relocate Share into DetailPane

**Files:** `client/src/components/DetailPane.tsx`, `client/src/components/AudioPlayerView.tsx`
**Requires review:** false

Add `ShareDialog`'s trigger to `DetailPane.tsx`, in a new top row alongside the existing season/episode label (`{seasonLabel}`), right-aligned — matching `plans/004`'s corner-icon+text placement, spatially separate from the Play button below it. `DetailPane` needs a new prop, `currentTime?: number`, passed only when `isCurrentPlayerEpisode` is true (mirrors `ShareDialog`'s own `currentTime` contract — omit entirely for a beginning-only share when this episode isn't the one playing). `App.tsx`'s `<DetailPane .../>` call site passes `usePlayerStore(s => s.currentTime)` gated by `isCurrentPlayerEpisode` (`viewingEpisode?.id === playerEpisode?.id ? currentTime : undefined`).

Leave `AudioPlayerView.tsx`'s two existing `ShareDialog` render sites (desktop bar, mobile full-screen overlay) in place for now — Step 9 removes the mobile one when it retires the overlay; the desktop bar's copy stays permanently (desktop's persistent dock is a different, valid place for it, per `plans/004`'s open question about the two shells' intentionally-asymmetric navigation).

**Acceptance criteria:**
- [ ] `DetailPane` renders a Share trigger in a corner row above the title, functionally identical to the existing `ShareDialog` (same dialog, just a new call site).
- [ ] Sharing from `DetailPane` while viewing the actively-playing episode offers the "start at {timestamp}" option; viewing a different (non-playing) episode's detail offers a beginning-only share.
- [ ] No visual change to `AudioPlayerView.tsx`'s existing two Share locations in this step.
- [ ] New `DetailPane.test.tsx` cases cover both the with-timestamp and without-timestamp paths.
- [ ] `cd client && npm test`, `npm run typecheck`, and `npm run lint` all pass with this step's changes in place (see Quality gate in Context).

---

### Step 7: Extract `TransportControls` and add it to `DetailPane`

**Files:** `client/src/components/TransportControls.tsx` (new), `client/src/components/AudioPlayerView.tsx`, `client/src/components/DetailPane.tsx`, `client/src/App.tsx`, `client/src/store/playerStore.ts`, `client/src/utils/playback.ts` (new)
**Requires review:** true

Move the existing local `TransportControls` function out of `AudioPlayerView.tsx` into its own exported file, `client/src/components/TransportControls.tsx`, unchanged in behavior — `AudioPlayerView.tsx` imports it back in. This is a pure extraction (no behavior change) so it can be reused from `DetailPane`.

**Seeking from outside `AudioPlayerView` needs a real mechanism — `onSeek`/`setCurrentTime` alone will not move actual playback.** `AudioPlayerView`'s own scrub bar works because its `handleSeek` sets `audioRef.current.currentTime` *directly*, then calls `onSeek(time)` purely to notify the host for display/persistence — nothing subscribes to an external `currentTime` change and applies it back to the `<audio>` element. `DetailPane` has no `<audio>` ref of its own (only `AudioPlayerView` does), so a naive `onSeek`/`setCurrentTime` call from `DetailPane` would update the number shown everywhere but leave real playback untouched — the very next `timeupdate` tick would snap the display back to wherever the audio actually is. Speed does *not* have this problem: `speed` genuinely is prop-driven today (`useEffect(() => { audioRef.current.playbackRate = speed }, [speed])`), so `onSpeedChange`/`setSpeed` from `DetailPane` already works correctly with no new plumbing.

Fix this the same way the codebase already solves "an external button needs to trigger an effect only `AudioPlayerView`'s `<audio>` ref can perform" — the existing `retryNonce`/`retrySignal` pattern. Add to `playerStore.ts`:

```ts
seekRequest: { time: number; nonce: number } | null
requestSeek: (time: number) => void   // set({ seekRequest: { time, nonce: <increment> } })
```

Add a new prop to `AudioPlayerViewProps`, `seekRequest?: { time: number; nonce: number }`, watched via an effect exactly like the existing `retrySignal` effect (compare `nonce` against a ref of the last-seen value; on change, set `audioRef.current.currentTime = time` and call `onSeek(time)`). `AudioPlayer.tsx` passes `seekRequest` from the store straight through, same as it already does for other store fields. `DetailPane`'s scrub bar and ±15s skip buttons call `requestSeek(...)` (via a new prop, e.g. `onRequestSeek: (time: number) => void`, wired in `App.tsx` to `usePlayerStore.getState().requestSeek`) — never `onSeek`/`setCurrentTime` directly.

`DetailPane.tsx` gains new optional props: `currentTime`, `duration`, `speed`, `onRequestSeek`, `onSpeedChange` (plus whatever skip-button props are needed — either four discrete `onSkipStart`/`onSkipEnd`/`onBack15`/`onForward15` or a single `onSkip: (seconds: number) => void`, executor's choice, but all of them ultimately call `onRequestSeek` with a clamped target, not a bare `onSeek`). When `isCurrentPlayerEpisode` is true, render a `ProgressBar` (already a standalone component, reused as-is, wired to `onRequestSeek` not `onSeek`) + times row + `TransportControls`, positioned between the existing Play/Pause button and the description — reusing the exact conditional-visibility rule from `plans/004`: these controls render only when `isCurrentPlayerEpisode`, never for an episode merely being browsed. Use `font-mono` (Step 2) for the time labels, matching the design system's numeric-data convention.

Lift the "clamp seek target to `[0, duration]`" and "cycle through `SPEEDS`" logic — currently local to `AudioPlayerView.tsx`'s `skipTo`/`cycleSpeed` — into `client/src/utils/playback.ts` as plain exported functions, so `AudioPlayerView` and `DetailPane`'s call site in `App.tsx` share one implementation instead of two hand-copied ones. `App.tsx`'s `<DetailPane .../>` call site wires `currentTime`/`duration`/`speed` from `usePlayerStore()` and `onRequestSeek`/`onSpeedChange`/skip handlers built from `playback.ts`'s helpers plus `requestSeek`/`setSpeed`.

This step must land and be verified working **before** Step 9 removes `AudioPlayerView`'s mobile full-screen overlay — that overlay is currently the only place mobile listeners can scrub/skip/change speed, and Step 9 deletes it. Do not skip ahead.

**Acceptance criteria:**
- [ ] `TransportControls` renders identically from its new file; `AudioPlayerView.tsx`'s existing three render sites (mini-bar has none, mobile overlay, desktop bar) are visually unchanged.
- [ ] Scrubbing or skipping from `DetailPane` moves the *actual* `<audio>` element's `currentTime` (verified by scrubbing in `DetailPane` and observing the change reflected in the mini-bar/dock's own position, not just the number in `DetailPane` itself) — not just the displayed number, which is the specific bug this step's `seekRequest` mechanism exists to prevent.
- [ ] Changing speed from `DetailPane` audibly changes playback rate, confirmed via the existing `speed`-prop-driven effect (no new mechanism needed for this one).
- [ ] Viewing any other (non-playing) episode's detail pane shows no transport controls at all — only the Play button.
- [ ] `AudioPlayerView.test.tsx`'s existing transport-related assertions still pass against the extracted component; new `DetailPane.test.tsx` cases cover the conditional-visibility rule and that seek/skip/speed actions call `requestSeek`/`setSpeed`, not a bare `setCurrentTime`.
- [ ] `cd client && npm test`, `npm run typecheck`, and `npm run lint` all pass with this step's changes in place (see Quality gate in Context).

---

### Step 8: Active-row indicator — surface/shadow instead of border

**Files:** `client/src/components/EpisodeItem.tsx`
**Requires review:** false

Replace the active-row treatment (`border-l-2 border-[var(--accent)] bg-zinc-200/60 ... dark:bg-zinc-800/60`) with a border-free version using Step 1's tokens: `bg-surface` + a shadow utility (reuse whichever `shadow-*` class the codebase already leans on for elevated surfaces, e.g. the `shadow-lg` used on cover art in `DetailPane.tsx`, scaled down if that reads too heavy at row scale — pick one and use it consistently) + `text-ink` for the title, matching `plans/004`'s "surface/shadow for is-viewed, accent color/weight for is-playing" pattern (the existing `isPlaying` EQ-bar treatment already correctly uses accent-color-only and needs no change).

**Acceptance criteria:**
- [ ] The active row has no border in either theme; it's visually distinguished by background/shadow only.
- [ ] The `isPlaying` (EQ bars) treatment is unchanged.
- [ ] `EpisodeItem.test.tsx`'s two border-specific assertions ("active state: has left border class, no solid accent fill" and "inactive state: no aria-current, no border-l-2") are rewritten to assert the new classes instead (see Testing).
- [ ] `cd client && npm test`, `npm run typecheck`, and `npm run lint` all pass with this step's changes in place (see Quality gate in Context).

---

### Step 9: MobileTabBar Playing-tab rework

**Files:** `client/src/components/MobileTabBar.tsx`, `client/src/App.tsx`, `client/src/components/AudioPlayerView.tsx`, `client/src/components/AudioPlayer.tsx`
**Requires review:** true

This is the plan's most architecturally significant step and depends on Step 7 already being complete (mobile transport controls must exist in `DetailPane` before this step removes the only other place they currently live).

**`MobileTabBar.tsx`:**
- Change `MobileTab` to `'playing' | 'episodes' | 'settings'`.
- Remove `TabIcon`/all three `<svg>` icons — per the no-icons-outside-transport principle, apply uniformly across all three tabs (leaving Playing icon-free while Episodes/Settings keep icons would be visually incoherent, not a partial adoption). Replace with: `text-[var(--accent)]` + `font-medium` on the active tab's label, plus a thin 2px accent-colored indicator anchored to the **bottom** of the label — a small absolutely-positioned `<span>` since Tailwind has no first-class pseudo-element utility for this — consistent across all three tabs, matching the published mockup's exact placement (not "executor's choice"; the mockup already settled this) — that fades in/scales in on the active tab, matching `plans/004`'s stated "thin accent line = the one repeated position motif."
- Replace `disabled={!hasPlayerEpisode}` — the tab is always tappable now. Remove the `hasPlayerEpisode` prop entirely.
- Replace `onExpandPlayer: () => void` with `onSelectPlaying: () => void`.
- `activeTab` prop stays a single value (`'playing' | 'episodes' | 'settings'`), computed by the caller (see below) — `MobileTabBar` itself does no comparison beyond `tab === activeTab` per button, same as today for Episodes/Settings.
- **Accessible name for the Playing button.** Today's button has no visible icon-independent label at all — its accessible name comes from `aria-label="Listening"` specifically to avoid colliding with the mini-bar's own `aria-label="Now playing: {title}..."`, with the visible "Playing" text marked `aria-hidden`. Once the icon is gone, "Playing" is the button's only visual content, so let it also be the accessible name — drop `aria-label="Listening"` and the `aria-hidden` on the span (matching how Episodes/Settings already get their accessible name from their own visible text with no override). This satisfies WCAG 2.5.3 Label in Name, which the current mismatched-label setup does not. Update the mini-bar's `aria-label` (see below) so the two remain unambiguous by exact string, not by relying on an artificial "Listening" vs. "Playing" split.

**`App.tsx`:**
- Add `handleViewPlaying`: if `playerEpisode` is not null, `setViewingEpisode(playerEpisode); setFocusedPane('detail')`. If `playerEpisode` is null, `setViewingEpisode(null); setFocusedPane('detail')` — `DetailPane` already renders its existing, tested "Select an episode to begin" placeholder for a `null` episode, so tapping Playing with nothing loaded shows that placeholder rather than being disabled. This is a deliberate behavior decision (the tab is always live; "nothing playing" is a real, already-built empty state, not a new one) — flag it explicitly at review since it changes user-visible behavior from today's disabled-button approach.
- Compute the tab bar's `activeTab`: `focusedPane === 'settings' ? 'settings' : focusedPane === 'detail' && viewingEpisode?.id === playerEpisode?.id && playerEpisode !== null ? 'playing' : focusedPane === 'detail' ? null /* no tab highlighted — browsing a non-playing episode's detail, same as today's behavior */ : 'episodes'`. Adjust `MobileTabBar`'s `activeTab` prop type to accept `MobileTab | null` to express "no tab active" cleanly, rather than forcing a false match against one of the three real values.
- Wire `MobileTabBar`'s `onSelectPlaying={handleViewPlaying}`.
- Remove `expandSignal` state and its prop threading into `<AudioPlayer .../>`.

**`AudioPlayerView.tsx` / `AudioPlayer.tsx`:**
- Delete the mobile full-screen overlay branch (`isFullScreenOverlay`, the `expanded` state, `expandSignal` prop and its effect, the `ShareDialog` render site inside that branch — per Step 6's note, this is the one Share location this step removes) entirely. Mobile `AudioPlayerView` now only ever renders the mini-bar (or nothing, when `episode` is null) — never a full-screen state of its own.
- The mini-bar's row tap (currently `onClick={() => setExpanded(true)}`) now needs to invoke the host's "go to the playing episode's detail view" action instead of a local `expanded` toggle — add a new prop `onTapMiniBar?: () => void`, called from the row's `onClick` (keep the existing `stopPropagation`-guarded inner Play/Pause tap target unaffected, that still just toggles play/pause). Wire `App.tsx`'s `<AudioPlayer .../>` call site (and `AudioPlayer.tsx`'s own passthrough) to pass `handleViewPlaying` through as `onTapMiniBar`.
- Update the mini-bar's own `aria-label` — currently `` `Now playing: ${episode.title}. Tap to expand.` ``, which becomes false once there's no overlay to expand to. Change the trailing phrase to `"Tap to view."` (the accessible name stays distinct from the tab bar's plain `"Playing"` by virtue of the full sentence, not by an artificial word substitution).
- Remove `expandSignal` from `AudioPlayerViewProps` and `AudioPlayerProps` (`AudioPlayer.tsx`) entirely — no remaining caller needs it once `MobileTabBar` and the mini-bar both route through `handleViewPlaying`/`onTapMiniBar` instead.

**Acceptance criteria:**
- [ ] Tapping "Playing" navigates to `DetailPane` showing the currently-loaded episode (full metadata, working transport per Step 7), and is never disabled.
- [ ] Tapping "Playing" when nothing has ever played shows `DetailPane`'s existing empty-state placeholder, not a disabled button or an error.
- [ ] The "Playing" tab shows as active only when the detail pane is showing the actual playing episode — browsing to a different episode's detail via the episode list does not light up "Playing" (nor "Episodes", matching today's existing behavior of no tab highlighted while drilled into any detail view).
- [ ] All three tabs render with no icons and share one consistent active-state treatment (accent label color + bottom-anchored thin accent indicator).
- [ ] The Playing tab's accessible name matches its visible text ("Playing"); the mini-bar's accessible name is a distinct full sentence ("Now playing: {title}. Tap to view.") — no leftover "Listening" label anywhere.
- [ ] Tapping the mini-bar (outside its own Play/Pause button) navigates to the same `DetailPane` view as tapping "Playing" — there is no longer any full-screen "now playing" overlay reachable from anywhere.
- [ ] `MobileTabBar.test.tsx` and `AudioPlayerView.test.tsx` are rewritten for the above (see Testing) — this step has the largest test-file impact in the plan.
- [ ] `cd client && npm test`, `npm run typecheck`, and `npm run lint` all pass with this step's changes in place (see Quality gate in Context).

---

### Step 10: Full pass — verify no orphaned `expandSignal`/overlay references

**Files:** whole `client/src/` (verification only, edits only if something is found)
**Requires review:** false

After Step 9, grep the client source and test suite for `expandSignal`, `isFullScreenOverlay`, `hasPlayerEpisode`, and `onExpandPlayer` — none should remain anywhere (component props, call sites, or tests) except as historical text inside comments explaining *why* something changed, if the executor chooses to leave any (optional, not required). Run the full client test suite and `npm run typecheck` and fix anything this plan's steps left inconsistent.

**Acceptance criteria:**
- [ ] `grep -rn "expandSignal\|isFullScreenOverlay\|hasPlayerEpisode\|onExpandPlayer" client/src` returns no matches in non-comment code.
- [ ] `cd client && npm run typecheck` passes with zero errors.
- [ ] `cd client && npm test` passes in full (see Testing for the expected shape of what changed to get here).
- [ ] `cd client && npm run lint` passes with zero errors/warnings.

## Testing

**This is a gate, not a suggestion** (see Quality gate in Context): run `cd client && npm test`, `npm run typecheck`, and `npm run lint` after every step, not just at the end, and do not proceed to the next step while any of them are red. Several steps (7, 9 especially) touch heavily-tested files, and a regression is far cheaper to find and fix immediately after the step that caused it than to untangle at Step 10 alongside nine other steps' worth of changes.

**Tests that will fail and need rewriting (not just re-running), by step:**
- Step 4 — `SeasonTabs.test.tsx`'s 3 tests (`renders season titles as buttons`, `clicking a season calls onSelect`, `active season button has aria-selected=true`) all assert the old flat-button-row markup; rewrite against the new trigger+popover.
- Step 5 — `SeasonChip.test.tsx` is deleted with its component; write `SeasonPicker.test.tsx` covering open/select/close/Escape/body-scroll-lock, mirroring `ShareDialog.test.tsx`'s existing patterns for the same concerns (portal, focus, Escape) since `SeasonPicker` follows the same portal convention.
- Step 8 — `EpisodeItem.test.tsx`'s `active state: has left border class, no solid accent fill` and `inactive state: no aria-current, no border-l-2` both assert border-class presence/absence directly; rewrite to assert the new surface/shadow classes instead. The `isPlaying`/EQ-bar tests are unaffected.
- Step 9 — `MobileTabBar.test.tsx`'s `disables the Now Playing tab when nothing is loaded`, `calls onExpandPlayer when Now Playing is tapped and an episode is loaded`, and `does not change activeTab styling when Now Playing is tapped` all assert behavior this step deliberately removes/changes; rewrite for the new always-tappable, `onSelectPlaying`, three-way-`activeTab` behavior. `AudioPlayerView.test.tsx` has 46 tests — expect a meaningful subset covering `expandSignal`/the full-screen overlay path to be deleted outright (the code they test no longer exists) rather than rewritten; the mini-bar and desktop-bar tests should be unaffected except for any that asserted the old `onClick={() => setExpanded(true)}` tap behavior, which need to assert `onTapMiniBar` is called instead.

**New test coverage needed, by step:**
- Step 1 — `client/src/tests/color.test.ts` (or wherever `getContrastTextColor` is currently tested) gains cases for `getDarkModeAccent`: a mid-lightness input gets raised toward the target range; an already-light input isn't pushed past the clamp; output is always a valid 6-digit hex.
- Step 3 — new `client/src/tests/search.test.ts` for `matchesEpisodeQuery`/`searchAllEpisodes` (case-insensitivity, guest-list matching, empty-query short-circuit); `EpisodeListView.test.tsx` gains cases for the search input filtering behavior and season-tag rendering on cross-season results.
- Step 6 — `DetailPane.test.tsx` gains cases for the new Share trigger being present and receiving the right `currentTime` (or `undefined`) depending on `isCurrentPlayerEpisode`.
- Step 7 — new `client/src/tests/TransportControls.test.tsx` (extracted component, port the relevant existing assertions from `AudioPlayerView.test.tsx` rather than writing from scratch); `DetailPane.test.tsx` gains cases for conditional transport visibility and that its controls call the right callbacks.
- Step 9 — `App.test.tsx` gains cases for `handleViewPlaying`'s two branches (episode loaded vs. null) and for the three-way `activeTab` computation, including the "browsing a non-playing episode's detail highlights no tab" case.

Existing tests not called out above (the bulk of `DetailPane.test.tsx`'s 19 tests, all of `ShareDialog.test.tsx`, `EpisodeList.test.tsx`) are expected to keep passing unmodified — the changes around them are additive.

## Notes

- **Full app-wide token migration is deliberately out of scope.** This plan only converts the specific components it touches for other reasons (Steps 2, 8, and whatever Steps 4–7/9 create or rewrite) to the new tokens. The admin panel and every other listener-facing component not touched here (e.g. `AppShell.tsx`'s own `bg-zinc-50 dark:bg-zinc-950`, `MobileSettingsView.tsx`) still hardcode `zinc-*`. A follow-up plan should sweep the remainder once this one has proven the token layer out in production; doing it all in one plan here would blow past the 3–12-step guidance this repo's plans are scoped to and mixes a mechanical rename with the actual interaction-model changes this plan is about.
- **The dark-mode accent algorithm (Step 1) is a genuine judgment call**, not the mockup's fixed value — an admin could pick a red, a teal, a near-white, or a near-black accent, and the lightening curve needs to hold up across all of them, not just purple. The HSL-lightness-floor approach here is a reasonable default; if it produces a washed-out result for some real admin-chosen colors during review, consider blending toward `--canvas` by a fixed ratio instead of a pure HSL-L adjustment (preserves more of the original hue's character) — noted as an alternative, not adopted by default.
- **Step 9's empty-"Playing"-tab decision** (show `DetailPane`'s existing null-episode placeholder rather than keep the tab disabled) is the plan's one deliberate UX-behavior change beyond what `plans/004` explicitly specified — `plans/004`'s mockup never had to answer this question because its mock data always has something loaded from the moment it opens. Reconsider at review if product feedback prefers keeping the tab disabled until first playback, matching today's exact behavior.
- Font file licensing: both Archivo and IBM Plex Mono ship under the SIL Open Font License, which permits bundling/redistribution — no attribution requirement beyond keeping the license file, per the OFL's own terms. Flagged for review in Step 2 as a housekeeping sanity check, not because there's an actual legal blocker.
