# Mobile-Responsive Listener UI Plan

> Revised after expert panel review (UI designer + front-end engineer). See "Panel Review Findings" for what changed and why.

## Goal
Make the public-facing listener UI (episode browsing + playback) usable on phone-sized viewports, as **one unified responsive system** — not a mobile-only patch bolted onto a frozen desktop UI. The same components, state, and interaction logic should serve both breakpoints; only layout/visibility should differ.

## Current State (confirmed via live testing at 320–490px viewports)

The listener UI (`AppShell.tsx` and its children) is a fixed 3-column desktop layout with **zero responsive breakpoints anywhere in the client** (confirmed via `grep -rn "sm:\|md:\|lg:\|xl:\|@media" client/src` — no matches). Structure:

```
AppShell
├── IconRail (fixed 64px, w-16)       — always visible
├── EpisodeList (fixed 256px, w-64)   — always visible
├── DetailPane (flex-1)               — gets whatever's left
└── AudioPlayer (fixed bottom bar)    — always visible when episode selected
```

At a real phone width (375–430px CSS px), the icon rail + sidebar alone consume ~320px, leaving **under 150px** for the detail pane. Confirmed problems, screenshotted live at 375px, and cross-verified line-by-line by both panel reviewers:

1. **Detail pane is unusably narrow.** Episode title wraps across 3+ lines; tag/guest pills stack vertically instead of flowing.
2. **Player bar permanently covers content.** `AudioPlayer.tsx` is `fixed bottom-0` with no compensating `padding-bottom` on the scrollable main content (`AppShell.tsx`'s `<main>`). The only thing masking this today is a hardcoded `pb-48` inside `DetailPane.tsx:30` — which lives in the wrong place (inside the pane, not the shell) and isn't tied to the player's actual height, so it's already fragile on **desktop today**, not just a mobile-only bug.
3. **No collapse/focus mode.** The episode list sidebar and the detail pane are both forced visible simultaneously at all times.
4. **Theme toggle overlaps player controls.** `ThemeBadge` (`fixed bottom-4 right-4`, `h-8 w-8` ≈ 32px) sits directly adjacent to the player's speed toggle at narrow widths — collision risk, and already under the 44px minimum touch target regardless of breakpoint.
5. **Icon rail wastes vertical real estate as a sidebar**, and two of its four icons (Seasons, Search) are currently **non-functional** — no `onClick` handler exists for them in `IconRail.tsx` today. This matters for the navigation-pattern decision below.

## Design Direction

Below the `md` breakpoint (768px), switch from "3 columns always visible" to a **single-pane, stacked navigation model**, implemented as *one* component tree with responsive branches — not a parallel mobile component set. See "Unified Responsive Architecture" below for how that constraint shapes each component.

### Layout by breakpoint

| Viewport | Layout |
|---|---|
| `< md` (phone/small tablet) | One full-width pane at a time: episode list OR detail pane. Icon rail collapses to a slim header + overflow menu (see Q1 resolution). Player is a compact mini-bar, expandable to a full-screen "now playing" view. |
| `>= md` (current desktop layout) | Current 3-column layout retained — but the player's mini/expand mechanism, the nav-item data, and the content-padding-to-player-height logic are the **same code**, just not visually triggered. Only pane visibility and rail orientation differ by breakpoint. |

### Mobile navigation flow
- Default view: full-width episode list (with season tabs)
- Tapping an episode: navigates to a full-width detail pane with a **back** button (top-left) that returns to the list
- On `list ⇄ detail` transitions, focus moves to the destination pane's heading/back button (screen-reader parity with the visual transition — see P0 list)

### Mobile player
- Default: compact mini-bar — episode title (truncated, `min-w-0` on the flex child so `truncate` actually works next to the play button) + play/pause + thin progress line. Height ~56px.
- Tapping the mini-bar opens a **full-screen "now playing" overlay** (not a partial bottom sheet — see Q2 resolution), animated via `transform: translateY` + `transition` and respecting `prefers-reduced-motion`, with an explicit collapse control (down-chevron).
- Main content area gets `padding-bottom` sized to the *current* player height (mini vs expanded) via a single CSS custom property (e.g. `--player-h`) plus `env(safe-area-inset-bottom)`, consumed by `AppShell.tsx`'s `<main>`. **This replaces the `pb-48` hack in `DetailPane.tsx` for both breakpoints, not just mobile** — it's shared infrastructure, not a mobile-only fix.

### Theme toggle
Move off `fixed bottom-4 right-4` on mobile — relocate into the header/overflow menu. Bump to ≥44px touch target at all breakpoints while touching this component.

### Navigation icons (Episodes / Seasons / Search / Admin)
Extract into a single shared data structure (`{icon, label, onClick, active}[]`) consumed by two thin presentational layouts — a vertical rail (`>= md`) and a mobile header/overflow menu (`< md`) — so nav items can't drift out of sync between breakpoints the way two independently maintained icon lists would.

## Unified Responsive Architecture

This section exists because the original draft of this plan declared desktop "unchanged," which both panel reviewers independently flagged as the biggest risk in the plan — it invites building two divergent, hard-to-maintain UI paradigms instead of one responsive system. Per-component resolution:

| Component | Resolution |
|---|---|
| **`AppShell.tsx`** | Stays **one component**, one file. 3-column vs. stacked-single-pane is a real structural fork (not just spacing), so it will have two conditional JSX branches — but both branches must read from the **same breakpoint source of truth** as `AudioPlayer` and the nav rail (see `useBreakpoint` hook below), so the shell, player, and nav can't desync at the `md` boundary. Root container also switches `h-screen` (`100vh`) to `min-h-dvh`/`h-dvh` — `100vh` overshoots the visible area under iOS Safari's dynamic toolbar, hiding content; this is a concrete bug fix, not just a class rename. |
| **`IconRail.tsx`** | Split into two thin presentational components (`IconRail` for the desktop vertical rail, a new mobile header/overflow-menu component) that both consume the **same shared nav-item data array and click handlers** (see above). This is a refinement from an earlier "keep it one file" recommendation: `IconRail`'s vertical layout (`flex-col`, `border-r`, a `flex-1` spacer pushing Admin to the bottom) and a horizontal mobile header genuinely differ enough in DOM structure that cramming both into one file via responsive utility classes produces tangled, hard-to-read markup. The drift risk the "one file" idea was guarding against is actually solved by the **shared data array**, not by physical file location — two thin layout wrappers over one shared nav-item source can't drift the way two independently-hardcoded icon lists could. |
| **`AudioPlayer.tsx`** | Stays **one component**, one state machine (mini/expanded), one height-measurement mechanism feeding the shared `--player-h` variable. Breakpoint only changes the *default* expanded state (mobile defaults to mini; desktop keeps today's always-expanded bar, since there's screen real estate for it) — the mini/expanded mechanism, markup, and transport controls are identical code either way. |
| **`DetailPane.tsx`** | The list/detail pane-swap behavior (one pane at a time vs. both simultaneously) is a **genuinely different experience by design** — desktop's dual-pane view is a legitimate, better use of a wide viewport, and should not be collapsed to match mobile. But the back-button component and the padding/height calc must still be one shared implementation gated by breakpoint, not duplicated. `p-8` (32px each side) becomes `p-4 md:p-8` — at 32px/side it eats a sixth of a 390px screen's width. |
| **`ThemeBadge.tsx`** | Shared component; only its parent slot/position changes per breakpoint (already correctly scoped this way in the original draft). |

### Breakpoint state must be viewport-driven, not a mobile/desktop boolean

The original draft scoped `mobileView: 'list' | 'detail'` as "mobile-only — desktop keeps showing both panes side by side regardless of this state." Both reviewers flagged this as the wrong shape: a boolean split can never represent someone resizing a desktop browser window down through 767px into phone-width territory (a real scenario — split-screen, resizable windows, devtools open) — the app would keep rendering the desktop 3-column layout squeezed into a narrow window instead of gracefully becoming the mobile single-pane layout, because nothing is actually watching the viewport width.

**Resolution:**
- Add `client/src/hooks/useBreakpoint.ts` — a `matchMedia`-backed hook (e.g. `useIsNarrowViewport()` or `useBreakpoint('md')`) that reacts live to resize events, not a one-time `window.innerWidth` read. This becomes the single source of truth consulted by `AppShell`, `AudioPlayer`, and the nav rail.
- Rename `mobileView` to something breakpoint-agnostic, e.g. `focusedPane: 'list' | 'detail'`, owned by `App.tsx` and **always** set on episode selection (not gated by device class). `AppShell` decides whether `focusedPane` has any *visible* effect based on the live breakpoint from `useBreakpoint` — below `md` it drives which pane renders; at/above `md` both panes render regardless of its value. This makes "phone-width desktop window" and "actual phone" provably identical rather than two different code paths that happen to look similar.

## Open Questions — Resolved

The original draft left these open with tentative leans. The panel reviewed them; **the UI designer and front-end engineer disagreed on Q1 and Q2**, so both perspectives are recorded below along with the resolution and reasoning.

### Q1: Bottom tab bar vs. overflow menu for mobile nav icons

- **UI designer's recommendation: overflow menu / header, not a bottom tab bar.** A bottom tab bar earns its cost when switching between co-equal top-level destinations. Here there's effectively one real destination (Episodes) plus an owner-only door (Admin) — Seasons is already a filter inside the list (`SeasonTabs`), and **Search has no backing implementation at all** (`IconRail.tsx`'s search button has no `onClick`). Promoting a dead Search icon into a prominent, always-visible tab bar advertises a broken feature. It also removes the exact `fixed bottom-0` stacking/safe-area collision risk that both reviewers flagged as the highest-risk implementation detail in this whole plan.
- **Front-end engineer's first-pass review** affirmed the original plan's bottom-tab-bar lean as technically sound, but was evaluating feasibility/architecture, not re-examining which nav items actually deserve prime real estate. A deeper second-pass engineering review independently confirmed the "inert buttons" problem the design reviewer raised (Episodes/Seasons/Search have no handlers, only Admin does), and added: if a bottom bar were used anyway, it and the mini-player should share a single `fixed bottom-0 flex-col` wrapper so there's one bottom-padding calculation, not two independently-computed fixed elements.
- **Resolution: overflow menu / header wins.** The design reviewer's objection is a concrete, verifiable functionality gap (not a stylistic preference), independently corroborated by both engineering passes, and it also removes the stacked-fixed-element risk entirely rather than just mitigating it. Put the podcast name into a slim mobile header with a right-aligned overflow (⋯) button holding Admin + theme toggle; `SeasonTabs` stays where it is in the list. Ship a Search entry point (wherever it lives) only once search is actually implemented — it's out of scope for this plan.

### Q2: Player expand interaction — bottom sheet vs. full-screen "now playing"

- **UI designer's recommendation: full-screen overlay, not a partial bottom sheet.** The controls that need to be revealed (scrubber + 5 transport buttons + speed + timestamps, per the existing `AudioPlayer.tsx`) plus cover art are too much for a half-sheet without shrinking touch targets back below the 44px minimum — re-introducing the exact sizing problem this redesign is meant to fix. Full-screen also matches the convention already set by Apple Music/Spotify/Overcast for "now playing," and gives a cleaner focus-trap accessibility story than a sheet with ambiguous background focus.
- **Front-end engineer's first-pass review** called the tap-to-expand bottom sheet "the right minimal-change call," evaluating implementation delta rather than the touch-target consequence. A deeper second-pass engineering review **reversed this independently, converging on the same full-screen-overlay answer for a separate technical reason**: a variable-height bottom sheet requires animating `height: auto`, which plain CSS transitions can't do — implementing it well means `max-height` hacks or pulling in an animation library (e.g. framer-motion). A full-screen overlay animated with `transform: translateY` (`translate-y-full` → `translate-y-0`) is a clean `transition-transform` in pure Tailwind, no new dependency.
- **Resolution: full-screen overlay wins, now via two independent lines of reasoning (design + engineering) rather than one.** It's simultaneously the better UX (per the design reviewer's touch-target math) and the *smaller* implementation lift (per the engineering reviewer's animation-feasibility analysis) — the sheet was never actually the "minimal-change" option once you account for animating a variable height.

### Q3: Real device testing before shipping

- **Both reviewers independently concluded: yes, required, not optional** — and this should be promoted from an open question to a hard release gate. The entire risk surface of this plan is `fixed`-position bottom elements + `env(safe-area-inset-bottom)` + iOS Safari's dynamic toolbar and `100vh` behavior. Desktop-viewport Playwright (`test.use({ viewport: {...} })`) cannot render any of those quirks — it would not have caught the exact class of bug this plan exists to fix. **Minimum bar: real iOS Safari (device or simulator) + one Android Chrome pass before this ships**, in addition to (not instead of) the automated Playwright coverage below. Use `100dvh` not `100vh` in any full-height calculations, and confirm `viewport-fit=cover` is present in `client/index.html`'s viewport meta tag (currently just `width=device-width, initial-scale=1.0` — needs updating).

## What Needs to Change

| File | Changes |
|---|---|
| `client/src/App.tsx` | Add `focusedPane: 'list' \| 'detail'` state (viewport-agnostic, always set on episode select — see Unified Responsive Architecture); pass to `AppShell`. **Threading detail:** `App.tsx` currently only *reads* `episode` from `playerStore` — the actual selection happens inside `EpisodeList.handleEpisodeClick`, which `App` doesn't see. Add an `onEpisodeSelect` callback prop threaded from `App` → `EpisodeList`, called at the top of `handleEpisodeClick` alongside the existing `setEpisode`/`setPlaying` calls, which sets `focusedPane('detail')`. Do **not** sync this via a `useEffect` keyed on `episode?.id` — that's a derived-state-in-effect anti-pattern and would also incorrectly fire the pane switch on desktop. |
| `client/src/hooks/useBreakpoint.ts` **(new)** | `matchMedia`-backed hook, single source of truth for `AppShell`/`AudioPlayer`/`IconRail` breakpoint branching; must react live to resize, not just read width at mount |
| `client/src/components/AppShell.tsx` | Responsive layout branches sharing `useBreakpoint`; consumes shared `--player-h` CSS var for `<main>` padding-bottom (`+ env(safe-area-inset-bottom)`) |
| `client/src/components/IconRail.tsx` | Extract nav items into shared data array/handlers; desktop rail stays here |
| `client/src/components/MobileHeader.tsx` **(new)** | Slim mobile header + overflow menu (Admin + theme toggle), consumes the same shared nav-item data as `IconRail.tsx` — see Q1 resolution and Unified Responsive Architecture (two thin components, one shared data source, not one file) |
| `client/src/components/EpisodeList.tsx` | Full-width on mobile; add per-season loading indicator (currently silent between season-tab taps, more noticeable full-width) |
| `client/src/components/EpisodeItem.tsx` | Decide meta-row (date · duration · guests) wrapping behavior at mobile width — truncate whole row to one line rather than wrapping to two |
| `client/src/components/DetailPane.tsx` | Add mobile back button + focus-on-transition; `p-8` → `p-4 md:p-8`; replace hardcoded `pb-48` with the shared `--player-h`-driven padding (removed from here, now owned by `AppShell`); handle empty-season state |
| `client/src/components/AudioPlayer.tsx` | Add compact mini-bar mode + full-screen expand (not bottom sheet — see Q2), `translateY` transition respecting `prefers-reduced-motion`; bump `p-1` skip/speed buttons to ≥44px targets at mobile widths; measure actual height into `--player-h` |
| `client/src/components/ThemeBadge.tsx` | Reposition on mobile (header/overflow menu slot); bump `h-8 w-8` (32px) to ≥44px touch target |
| `client/src/components/SeasonTabs.tsx` | Bump `py-1` tabs to ≥44px touch target height on mobile |
| `client/index.html` | Add `viewport-fit=cover` to the viewport meta tag (required for `env(safe-area-inset-*)` to work) |
| `client/src/index.css` | Add `--player-h` custom property definition/defaults; safe-area-inset utilities if not covered by Tailwind defaults |
| `client/tailwind.config.ts` | No changes expected — default breakpoints (`sm`/`md`/`lg`) are sufficient |

## Automated Tests

**Correction from panel review:** the original draft of this plan proposed unit-testing breakpoint-driven layout (e.g. `AppShell.test.tsx` "renders single-pane at mobile width, 3-column at desktop width") using a "`matchMedia`/resize mocking pattern already used in `useTheme.test.ts`." **Verified false** — `grep -rn "matchMedia" client/src` returns zero matches anywhere in the client; `useTheme.test.ts` mocks `localStorage`, not `matchMedia`. More fundamentally, this approach is unachievable regardless of precedent: jsdom (Vitest's DOM environment here) does not evaluate CSS or compute layout, so if the mobile/desktop layout switch is implemented via Tailwind responsive classes (`hidden md:flex`, etc.), **both layout branches exist in the DOM simultaneously** in a jsdom test — there is no way to assert "which one is visually showing" from a class-based responsive layout in jsdom, no matter what `matchMedia` reports.

**Resolution — split test responsibility by what's actually testable in each layer:**
- **Unit tests (Vitest/jsdom):** only for JS/prop/state-driven behavior — things that change the DOM structure itself, not just which CSS class wins. This means: the `useBreakpoint` hook's own logic (does it call the right `matchMedia` API and react to change events — testable by mocking `window.matchMedia` directly, a new mock, not an existing pattern), the back button's presence/click behavior when driven by a `focusedPane` prop, the player's expand/collapse `useState` toggle, and focus-management assertions.
- **E2E tests (Playwright):** the *only* layer that can actually verify breakpoint-driven visual layout, because Playwright renders real Chromium with real CSS and real computed layout. All "single-pane at mobile width, 3-column at desktop width" assertions belong here, not in Vitest.

### Client Tests (`client/src/tests/`)
| Test File | Test Case |
|---|---|
| `useBreakpoint.test.ts` **(new)** | Hook calls `window.matchMedia` with the expected query and reacts to a mocked `change` event, not just the initial value — mock `matchMedia` directly (no existing precedent to reuse; this is new test infrastructure) |
| `AppShell.test.tsx` | **Existing assertions will break and need rewriting**, not just extending: current tests assert rail+sidebar content lives inside a single `<aside>` (lines ~25–28) and that `ThemeBadge` renders inside `.fixed.bottom-4.right-4.z-50` (line ~76) — both assumptions change once the mobile header and repositioned theme badge exist. Update these to match the new structure. Do **not** attempt to assert mobile-vs-desktop *layout* here (see correction above) — that's e2e-only. |
| `AudioPlayer.test.tsx` | Mini/expanded toggle via `useState`: expand on tap, collapse via explicit control; title truncates correctly next to play button (`min-w-0` regression guard). Do not assert which one is visually the *default* per breakpoint — that's e2e. |
| `DetailPane.test.tsx` | Back button calls `onBack`/`focusedPane`-clearing handler when the prop indicates single-pane mode is active (prop-driven, not viewport-driven, so it's actually testable in jsdom); focus moves to back button/heading on pane transition |

### E2E Tests (`e2e/tests/`)
New `e2e/tests/mobile.spec.ts` — **must import the extended `test` from `../fixtures.js`** (`seededPage`/`adminPage`), not a bare `@playwright/test` import, otherwise there's no seeded season/episode data to navigate (confirmed pattern from `admin.spec.ts`). Use `test.use({ viewport: { width: 390, height: 844 } })` (iPhone 12/13 size) **per-describe block**, not as a global config default, to avoid silently changing desktop coverage of existing specs:
| Test Case |
|---|
| Episode list is full-width and visible on load; detail pane is not shown |
| Tapping an episode shows the detail pane full-width; list is hidden; focus lands on detail heading/back button |
| Back button returns to the episode list |
| Player mini-bar is visible after selecting an episode; doesn't overlap detail content or the overflow menu |
| Tapping the mini-bar opens the full-screen now-playing overlay; all controls are tappable (no overlap) |
| Resizing the viewport across the `md` boundary with an episode selected transitions layouts without losing state — **this is the layout-switch verification that unit tests can't provide** |
| At desktop viewport (default Playwright config, 1280×720), confirm `AudioPlayer`'s full transport controls still resolve by role/label (e.g. `getByRole('button', {name:'Playback speed'})`) — guards against the mini/expanded refactor accidentally changing what renders at `md+` |
| Existing `theme.spec.ts` and `player.spec.ts` still pass unmodified at their current default (desktop) viewport — confirms the refactor didn't regress desktop DOM structure those specs depend on |

Note: `e2e/playwright.config.ts` runs `workers: 1`, chromium-only, with `retries: 1` — the ~7 added mobile cases run serially with existing suites; no CI config changes needed, small runtime addition. CI's `e2e` job (`.github/workflows/ci-cd.yml`) runs against the built production image with `SERVE_CLIENT=true`, so responsive CSS is fully compiled by the time these tests run — no dev-server-only caveats.

### Manual / Release Gate (not automatable — see Q3)
- Real iOS Safari pass (device or simulator): confirm no content/controls hidden under the home indicator or dynamic toolbar, confirm `100dvh` usage doesn't clip the full-screen player
- One Android Chrome pass

## Out of Scope / Nice-to-haves (not this iteration)
- Tablet-specific intermediate layout (relying on `md`/`lg` defaults is enough for v1)
- Swipe gestures (swipe-back to list, swipe on mini-player to skip track)
- PWA / add-to-homescreen support
- Full landscape-specific mobile layout — but the full-screen player should defensively scroll/cap its own chrome so controls never get clipped in landscape, even without a bespoke landscape design
- Implementing Search (tracked separately; do not add a Search entry point to mobile nav until it exists)

## Files to Modify (summary)
- `client/src/App.tsx`
- `client/src/hooks/useBreakpoint.ts` (new)
- `client/src/components/AppShell.tsx`
- `client/src/components/IconRail.tsx`
- `client/src/components/MobileHeader.tsx` (new)
- `client/src/components/EpisodeList.tsx`
- `client/src/components/EpisodeItem.tsx`
- `client/src/components/DetailPane.tsx`
- `client/src/components/AudioPlayer.tsx`
- `client/src/components/ThemeBadge.tsx`
- `client/src/components/SeasonTabs.tsx`
- `client/index.html`
- `client/src/index.css`
- New: `client/src/tests/useBreakpoint.test.ts`
- Modified (breaking changes, not just additions): `client/src/tests/AppShell.test.tsx`
- New: `e2e/tests/mobile.spec.ts`

## Panel Review Findings (source material for the revisions above)

Reviewed by two independent expert agents against the actual codebase (not just this doc), each in two passes:
- **UI/UX designer** — confirmed all diagnosed bugs against exact file/line references; rated the original plan 8/10; flagged under-specified touch targets, safe-area-insets, animation, and focus management as P0 gaps; reversed the original Q1/Q2 leans with concrete reasoning (dead Search icon; touch-target math).
- **Front-end engineer** — confirmed diagnosis and test-plan patterns against the actual test suite and CI setup; independently identified the desktop-consistency gap as the plan's biggest structural risk; specified the `useBreakpoint` hook and `focusedPane` state redesign needed to make mobile and "narrow desktop window" provably identical rather than coincidentally similar. A deeper second pass caught a load-bearing factual error in the plan's own test strategy (a cited `matchMedia`/`useTheme.test.ts` precedent that doesn't exist — verified false by direct grep against the repo) and the `jsdom`-can't-compute-CSS constraint that follows from it, requiring the entire test-responsibility split between Vitest and Playwright to be rewritten. It also reversed its own first-pass position on the `IconRail` file split (see below) and on Q2, after examining the CSS animation constraints more closely.

Both reviewers converged independently on: desktop must not be "frozen," shared nav-item data over duplicated icon lists, and promoting safe-area-inset handling from an open question to a requirement. Where they disagreed with each other (Q1, Q2), the resolution favors the design reviewer's concrete, verifiable objections (non-functional Search icon; touch-target minimums) — and on Q2 specifically, the engineer's own deeper pass independently arrived at the same conclusion via a different technical argument (CSS can't animate `height: auto` cleanly), so that resolution is no longer just a designer-vs-engineer tiebreak, both roles agree.

One internal contradiction, reconciled here: the engineer's first pass recommended keeping `IconRail` as a single component with responsive branches (to prevent nav-item drift); its second, more detailed pass argued for splitting into `IconRail` (desktop) + a new mobile component (to avoid tangled class-soup from cramming a vertical rail and a horizontal header into one file). Both concerns are legitimate and not actually in tension once separated: the **drift risk** is solved by a shared nav-item data array (not by physical file location), and the **markup-complexity risk** is solved by two thin files consuming that shared array. This plan adopts the two-file structure with one shared data source — see `client/src/components/MobileHeader.tsx` in the file list above.
