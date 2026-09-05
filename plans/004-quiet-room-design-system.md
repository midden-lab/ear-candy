---
id: quiet-room-design-system
title: "Quiet Room Design System — desktop/mobile redesign reference"
status: reference
priority: 2
created: 2026-09-05
tags: [design-system, ux, frontend, redesign, reference, mobile]
---

# Quiet Room Design System

## Summary

This document records the "Quiet Room" desktop/mobile redesign direction as the settled design system Ear Candy is moving forward with for listener-facing UI. It is **not** an execution plan with steps to run — it's a reference for whoever builds new listener-facing features from here on, so decisions already made (and the reasoning behind them) don't get silently re-litigated or drifted away from feature by feature.

The direction was chosen from a panel of 6 independently-produced desktop redesign concepts, refined into a fully interactive desktop-and-mobile mockup, then iterated through four targeted UX passes (season navigation at scale, share-button placement, mobile tab-bar legibility, and unifying the mobile "Playing" destination with the existing episode detail view) — see **Process note** below.

Admin panel redesign is explicitly out of scope; this covers listener-facing UI only.

## Reference mockup

A fully interactive, click-through HTML/CSS/JS mockup exists at: https://claude.ai/code/artifact/45ce2080-cfd2-4bcc-91c0-5475ec994055

It demonstrates both the desktop and mobile listener-facing UI (toggle in the mockup's own UI — it doesn't rely on real viewport breakpoints), including browsing, season selection, search, playback (simulated), sharing, and theming. It is a standalone scratch artifact, not shippable code — treat it as a live reference for exact visual/interaction detail this document summarizes, not as a source to copy-paste from. (It also isn't guaranteed to stay published indefinitely; the settled decisions are the content of this document, the mockup is illustrative.)

## Core design principles

The Quiet Room language is deliberately restrictive, and the restriction is the point — it's what keeps a growing feature set from turning into visual noise.

- **No icons except playback transport.** Play/pause/skip are the only controls that get iconography, because they're the only controls a listener needs to recognize at a glance without reading. Everything else (season picker caret, overlay close X, back arrow, share glyph) is a small utility mark, not a navigational icon system. Do not add an icon to a new feature just because it needs affordance — use text, weight, or color first.
- **State is communicated by color/weight/shadow/surface, never by added borders.** An "active," "selected," or "playing" state changes the ink color, font-weight, background surface, or shadow of an element — it does not grow a border. The scrub bar is the one deliberate exception: it is the app's only real "edge," and that's intentional scarcity, not an oversight. A new feature that reaches for a border to indicate state is off-language; find the color/weight/shadow equivalent instead. (The real app's current `EpisodeItem.tsx` active-row indicator — `border-l-2 border-[var(--accent)]` — already conflicts with this principle; see **Component mapping**.)
- **Accent color (purple) is meaningful, not decorative.** It marks exactly three things: something is playing, a position/progress value, or "this is the one you're on." It is never used for arbitrary emphasis, warnings, or brand decoration. Before giving a new element the accent color, check that it's actually communicating one of those three states.
- **A thin accent line is the app's one repeated position/selection motif.** It appears as the scrub-bar fill, the mini-player progress line, and the mobile tab-bar's active-tab indicator. When a future feature needs a lightweight "you are here" signal, reach for this motif rather than inventing a new one (a dot, a pill, a checkmark) — visual consistency across the app depends on this motif staying singular.

## Viewing vs. Playing decoupling

Browsing the episode list or an episode's detail view never interrupts what's currently playing. Only an explicit Play action changes what's loaded into the player. This mirrors how every real podcast app behaves (you can read show notes for episode 12 while episode 9 keeps playing in the background), and it is already the production app's documented behavior, not a mockup invention — see CLAUDE.md gotcha #40 (`viewingEpisode`/`playerStore.episode` separation).

The mockup enforces this the same way: `viewingId` (what the detail view is currently showing) and `playingId` (what's actually loaded/playing) are separate state fields, updated independently. Tapping a row only ever changes `viewingId`. The Play button is the sole path that can change `playingId`, and it does so with real "interrupt" semantics — pressing Play on an episode that isn't already loaded replaces whatever was playing, exactly like a real player. Any new feature that touches navigation must preserve this separation; a feature that couples "look at X" with "play X" breaks a load-bearing assumption the rest of the UI depends on.

## Season navigation pattern

A flat horizontal tab row of seasons works at 3 seasons and breaks down well before 12 — it either wraps awkwardly or forces horizontal scrolling with no indication of how many seasons exist or where the current one sits among them.

The fix is modality-specific, not a single reused component:

- **Desktop** gets a dropdown/popover behind a fixed-width trigger, plus a cross-catalog search input that flattens every season into one filterable list and tags each result with its origin season (e.g. "S9") when a search is active. The trigger's fixed width means the season list can grow indefinitely without disturbing the surrounding layout.
- **Mobile** gets a full-screen picker overlay — explicitly not a dropdown/popover (a desktop-native modality that fights viewport space and touch-target sizing on a phone) and explicitly not a horizontal chip strip (chips can't communicate "12 seasons exist, you're on 9" once the strip exceeds screen width — the whole point of the picker is at-a-glance orientation, which a scrolling strip actively defeats). A bottom sheet was also considered and rejected: a sheet tall enough to be useful at 12 seasons ends up competing for the same vertical space it's meant to free up, at which point it's a full-screen picker anyway, just with extra drag-handle chrome.

The lesson for future catalog-scale features (e.g. a hypothetical tag or category browser): don't reuse one selector component across desktop and mobile by default — evaluate each modality's constraints separately.

## Share control placement

The share action originally lived inside the primary controls row, directly beside the large Play button — it crowded the one control that matters most on that screen and read as visual clutter inconsistent with the rest of the language's restraint. It was moved to a standalone icon+text control in a corner row, spatially and visually separated from playback entirely. The icon is custom-drawn (an arrow-out-of-tray glyph) rather than a stock icon, using the same stroke-width and line-cap treatment as the skip±15 transport icons specifically so it reads as part of the same icon family rather than a mismatched import. Any future secondary action placed near the Play button should default to this same corner-row pattern rather than crowding the primary control.

## Mobile "Playing" tab reuses the canonical episode view

The most architecturally significant decision in this direction: the mobile "Playing" tab (and tapping the mini-player dock) does not open a bespoke "now playing" screen. It routes into the exact same detail/episode view used when browsing from the episode list, just pre-scoped to whichever episode is currently loaded (`viewingId` is set to `playingId` on entry).

This matters for one concrete reason: there is exactly one place in the UI that renders an episode's title, art, description, and guest list. A browse-triggered view and a playback-triggered view can never drift out of sync with each other, because they are the same code path rendering the same data, not two hand-maintained copies. Any future field added to episode metadata (a new badge, a content warning, a transcript link) needs to be added once, to one view, and both entry points get it automatically.

Playback transport (scrub bar, ±15s skip, speed control) was folded into that same detail view rather than kept in a separate screen, but shown conditionally — only when the episode currently being viewed is also the one actually loaded (`viewingId === playingId`). This is correct because scrubbing or skipping an episode that isn't loaded is a meaningless action; the controls simply don't appear when they wouldn't do anything.

This reuse required one special case in the tab bar's active-state logic: the "Playing" tab shows as active only when the mobile pane is the detail view *and* the viewed episode equals the playing episode — not merely "any time the user is on the detail pane" (which would also be true when browsing into an unrelated episode's detail from the list, and would incorrectly light up "Playing"). Any future tab-bar addition that shares a destination pane with another entry point must replicate this narrower condition rather than keying active-state off the pane name alone.

**Real-app note:** the production app already ships a three-item mobile tab bar (`MobileTabBar.tsx`) with a "Playing" label, but it works nothing like the pattern above — see **Component mapping** for the specific conflicts to resolve, not layer on top of.

## Design tokens

The mockup runs on a small custom-property token layer that the real app does not have yet — today's app hardcodes Tailwind's `zinc-*` scale directly in every component (`text-zinc-900 dark:text-zinc-100`, `border-zinc-200 dark:border-zinc-800`, etc., see `DetailPane.tsx`, `SeasonTabs.tsx`, `EpisodeItem.tsx`) with no neutral-scale abstraction. Only two tokens exist in `client/src/index.css` today: `--accent`/`--accent-contrast` (admin-configurable, computed via `getContrastTextColor` in `utils/color.ts`), plus two layout tokens (`--player-h`, `--tabbar-h`). `tailwind.config.ts` has zero theme customization (`theme: { extend: {} }`).

Adopting the mockup's system means introducing a genuine neutral-scale token layer:

| Token | Light | Dark | Real-app equivalent today |
|---|---|---|---|
| `--canvas` | `#EEEFF0` | `#121014` | none — `bg-zinc-50 dark:bg-zinc-950` on `body` (`index.css`) |
| `--surface` | `#FFFFFF` | `#1B1920` | none — raw `bg-white`/`bg-zinc-*` per component |
| `--ink` | `#121316` | `#F1EFF3` | none — raw `text-zinc-900 dark:text-zinc-100` per component |
| `--ink-2` | `#5B5E64` | `#A9A6AF` | none — raw `text-zinc-600 dark:text-zinc-300` |
| `--ink-3` | `#8E9197` | `#75727A` | none — raw `text-zinc-500 dark:text-zinc-400` |
| `--ink-4` | `#B4B7BC` | `#4C4A51` | none — raw `text-zinc-400 dark:text-zinc-500` |
| `--accent` | `#9437FF` | `#B583FF` (lightened for AA text contrast on dark) | **exists today**, but as one flat value with no light/dark pair — `useTheme.ts` sets it once from `settings.accent_color` regardless of theme. A real implementation needs a dark-mode accent variant, not just the neutral scale. |

Carries over as-is: the `--accent`/`--accent-contrast` mechanism (keep it, just add the dark-mode variant). Needs to change: everywhere else — every hardcoded `zinc-*` class in every component becomes a token reference (either CSS custom properties toggled by `.dark`, mirroring how `--accent` already works, or a Tailwind theme extension mapping `zinc.900` etc. to CSS vars so existing utility classes keep working). This is the single largest mechanical change implied by adopting this design system — it touches every component, not just new ones.

Also net-new, with no real-app equivalent at all: Archivo (UI text) + IBM Plex Mono (numeric/mono data — episode numbers, timestamps, durations, season counts) — `index.html` loads no fonts today, so the app currently renders in the browser's default sans-serif stack. Also net-new: the `cubic-bezier(.32,.72,.26,1)` easing curve (no easing convention exists in the real app's Tailwind transitions today — they use Tailwind's default `transition-colors` timing), and cover art rendered as pure-CSS "sound-wave rings" (`repeating-radial-gradient` + accent circles) as the mockup's placeholder aesthetic — this is not a replacement for the real app's actual uploaded-image cover art pipeline (`EpisodeCoverArt.tsx`, thumb/detail WebP variants via `sharp`), just a decision about what to show when an episode has no real art.

## Component mapping

| Mockup concept | Real component | Fit |
|---|---|---|
| Season dropdown/popover (desktop) | `SeasonTabs.tsx` (currently a horizontal scrolling row of buttons, `overflow-x-auto`, no dropdown) | **Rework** — different interaction model entirely, not a style pass |
| Season full-screen picker (mobile) | none | **New component** |
| Cross-catalog search input | none | **New component** — also needs a new API shape or client-side filter, since `getEpisodes()` today is season-scoped only |
| Relocated icon+text share control | `ShareDialog.tsx`'s trigger, currently rendered twice inside `AudioPlayerView.tsx` (player bar + full-screen overlay), never in `DetailPane.tsx` | **Rework** — the dialog itself can likely stay, but its trigger needs to move into `DetailPane.tsx` next to episode metadata, and `AudioPlayerView.tsx`'s two existing render sites removed |
| Mobile bottom tab bar | `MobileTabBar.tsx` — already exists, already has three items (Episodes / Playing / Settings) | **Partial fit, real conflict** — see below |
| Unified "episode view" (Playing tab + row-tap → same view) | `DetailPane.tsx` | **Direct fit for the view itself**; the *routing* into it from a "Playing" tab does not exist yet — see **State model implications** |
| Mini-player dock | `AudioPlayerView.tsx`'s mini-bar | Direct fit |

The `MobileTabBar.tsx` finding is the most important one for whoever picks this up: the real app already shipped a three-item tab bar with a "Playing" label, but it works nothing like the design settled on here. Today's "Playing" tab (a) uses icons (a plain circle/play-triangle glyph via `TabIcon`), directly conflicting with the icon-free-outside-transport principle; (b) is disabled (`disabled={!hasPlayerEpisode}`) rather than always tappable; (c) never changes `activeTab` or gets an active/current visual state — its type (`MobileTab = 'episodes' | 'settings'`) doesn't even include a `'playing'` value; and (d) its handler (`onExpandPlayer`, bumping `expandSignal`) opens `AudioPlayerView`'s own full-screen overlay — the same style of overlay this design started with and then deliberately replaced by routing into `DetailPane` instead (see **Mobile "Playing" tab reuses the canonical episode view**, above). Implementing this design system on mobile nav means **retiring** `AudioPlayerView`'s full-screen overlay path in favor of `DetailPane`-as-Playing-tab, not layering one on top of the other.

Also worth flagging: today's active-row indicator (`EpisodeItem.tsx`, `border-l-2 border-[var(--accent)]`) uses an actual left border for the "is-viewed" state — this design's stated principle is state via surface/shadow/color only, no added borders (see **Core design principles**). This is a real, pre-existing conflict, not something introduced by the redesign, and should be resolved when this system is adopted rather than carried forward.

## State model implications

The mockup's `viewingId`/`playingId` split already has a direct real-app analog: `App.tsx`'s `viewingEpisode` (plain `useState`) plus `usePlayerStore().episode` (Zustand), independently maintained per CLAUDE.md gotcha #40 — this part requires no new concept, just continuity.

What doesn't exist today: any pane/tab state shaped like the mockup's `mobilePane` with a `"detail"` value reachable two ways (row tap vs. Playing tab) plus a derived "is this the Playing tab" flag for tab-bar highlighting. The real equivalent, `App.tsx`'s `focusedPane` (`'list' | 'detail' | 'settings'`), is close in shape but was never designed for a third entry path — `MobileTabBar`'s Playing button currently bypasses `focusedPane` entirely (calls `onExpandPlayer`, not `setFocusedPane`). Wiring the settled pattern in means: adding a handler that does what the mockup's `viewNowPlaying()` does (`setViewingEpisode(playerEpisode); setFocusedPane('detail')`), and computing an `onPlayingDetail`-equivalent (`focusedPane === 'detail' && viewingEpisode?.id === playerEpisode?.id`) to drive the Playing tab's `aria-current`/active style — `MobileTabBar`'s props would need to grow from `activeTab: MobileTab` to something that can express this third computed state, since today's `activeTab` prop is fed a plain ternary (`focusedPane === 'settings' ? 'settings' : 'episodes'`) that has no room for it.

The conditional playback-transport-in-detail-view pattern (scrub/skip/speed shown only when the viewed episode is the loaded one) has no real-app equivalent at all — `DetailPane.tsx` today has a Play/Pause button and nothing else transport-related; scrub/skip/speed live exclusively in `AudioPlayerView.tsx`. Moving them (or duplicating them) into `DetailPane` is new plumbing, not a restyle.

## Open questions / not yet decided

- Admin panel redesign is out of scope — this document and the mockup cover listener-facing UI only.
- No accessibility audit beyond the ARIA attributes already present in the mockup's markup (carried over from the original static concept) — `MobileTabBar.tsx`'s real, tested `aria-current`/`aria-label` conventions should be treated as the higher bar to preserve, not regress from.
- Desktop has no "Playing" tab equivalent by design (its persistent dock already serves that role) — confirm this asymmetry is intentional before implementation, since it means the two shells' navigation models are not fully parallel.
- No real breakpoint was ever decided — the mockup toggles shells manually, not via real media queries. The real app already has a `useBreakpoint(MD_BREAKPOINT_QUERY)` hook (`EpisodeItem.tsx`) and an `md`-based split in `AppShell.tsx` worth reusing rather than inventing a new breakpoint value.
- No performance/bundle-size consideration was given — the mockup is static markup, not measured React component cost (fonts, new components, token-layer CSS all add weight not yet quantified).

## Process note

This direction was selected from a panel of 6 independently-produced desktop redesign concepts (editorial/magazine, control-room/DAW-style dashboard, Quiet Room/Swiss-minimalist, immersive ambient "now playing," community-radio, and library/stacks), each built without cross-contamination from the others. Quiet Room was chosen and built out into a fully interactive desktop-and-mobile mockup, then refined through four targeted UX passes — season navigation at scale, share-button placement, mobile tab-bar legibility, and the Playing-tab/detail-view unification — each pass grounded in explicit, independent UX-designer and frontend-engineer review rather than a single author's unchecked judgment call.
