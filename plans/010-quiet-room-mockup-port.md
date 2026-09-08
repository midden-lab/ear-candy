---
id: quiet-room-mockup-port
title: "Quiet Room: direct CSS/markup port from the settled mockup"
status: complete
priority: 1
created: 2026-09-07
steps_completed: 10
steps_total: 10
tags: [design-system, ux, frontend, visual-fidelity, css]
---

# Quiet Room: Direct Mockup Port

## Summary

Plans 007-009 hand-translated the mockup's design into Tailwind utility classes, one property at a time. That translation step is exactly where the fidelity kept drifting — three rounds of "closer, but still not correct" later, the user asked directly: can the mockup's actual CSS just be applied to the site instead of re-derived? Yes. This plan ports the mockup's CSS **verbatim** into a new stylesheet and rewrites every listener-facing component's markup to use the mockup's own class names and DOM structure, instead of a Tailwind approximation of them. React keeps owning all state, data-binding, and event handling — only the visual layer changes.

## Context

**Source of truth:** the full mockup HTML/CSS at `/Users/m8ttyb/.claude/projects/-Users-m8ttyb-workspace-midden-lab-ear-candy/c7a52194-0b75-40df-8d36-a89e58c294dd/tool-results/artifact-45ce2080-1788642339-3899.html`. Its `<style>` block (lines 8-438) is a complete, self-contained CSS file. Its markup (lines 440-772) shows the exact DOM structure and class names for both desktop and mobile shells, plus the share dialog.

**Already correct, do not re-touch:** `client/src/index.css`'s `:root`/`.dark` token blocks already match the mockup's tokens exactly (`--canvas`/`--surface`/`--ink*`/`--hair`/`--wash`/`--ring`/`--ring-2`/`--scrub-track`/`--shadow-art`/`--shadow-row`/`--shadow-dock`/`--ease`), confirmed by direct comparison during this plan's drafting. `tailwind.config.ts` already wires these as `colors.hair/wash/ring/ring-2/scrub-track`, `boxShadow.art/row/dock`, `transitionTimingFunction.quiet`. Archivo/IBM Plex Mono font loading is already correct (self-hosted, per `client/src/index.css`'s `@font-face` rules). None of this needs to change.

**What's actually wrong:** every *component-level* CSS rule in the mockup (`.masthead`, `.row`, `.dock`, `.m-tabbar`, etc.) was re-derived into Tailwind utility strings by hand across plans 005/007/008/009, and each translation pass introduced small, cumulative differences (wrong radius, wrong tracking, present-but-shouldn't-be borders, wrong spacing model, background fills that shouldn't render, etc.). This plan replaces that translation with a literal copy of the mockup's own CSS rules, and rewrites each component to use them.

**Two things in the mockup are tool-only and must NOT be ported:**
- `.preview-switch` (the Desktop/Mobile toggle chrome) and `.toast` (a demo-only notification) — these are the mockup-authoring tool's own UI, not part of the app.
- `.phone-frame`/`.shell-mobile`'s centering padding (the 390×800px bezel the mobile mockup is previewed inside) — the real mobile app renders at the actual viewport size, full-bleed. Port the `.m-*` component rules (header, scroll pane, tab bar, mini-player, season picker, etc.) but not the frame/bezel wrapper around them.

**Architecture decision (made here, not left open):** the ported CSS becomes a new global stylesheet, `client/src/styles/quiet-room.css`, imported once from `client/src/index.css` after the three `@tailwind` directives (so identical-specificity rules from this file win over Tailwind's own component-layer defaults, matching how `@tailwind utilities` already wins over `@tailwind base`/`components`). Classes are plain global class names exactly as the mockup names them (`.masthead`, `.row`, etc.) — no CSS modules, no `@apply` wrapping — matching this codebase's existing precedent of a few hand-written global classes already living directly in `index.css` (`.eq-bar`, `.mono` equivalents). Listener-facing components stop using Tailwind utility classes for anything the mockup's CSS already covers; Tailwind utilities remain fine for structural things the mockup has no equivalent for (e.g. `sr-only`, `flex`/`hidden` toggles driven by component props) and for the two Ear-Candy-only visual additions called out below. The admin pages (`pages/admin/*`) are entirely out of scope — they keep their current Tailwind styling untouched.

**Real, non-cosmetic finding from re-reading the mockup's actual markup (not just its CSS):** the desktop `.stage` (DetailPane) has **no inline scrub bar, skip buttons, or speed control** — only the big `.play-primary` button. Transport controls exist in exactly one place on desktop: the persistent `.dock` at the bottom of the screen. The real app's `DetailPane.tsx` currently renders an inline `ProgressBar`+`TransportControls` block on *all* breakpoints whenever `isCurrentPlayerEpisode` — correct for mobile (matches the mockup's `.m-now-controls`, which *is* real and shown only in the mobile detail pane) but wrong for desktop, where it duplicates what the dock already shows. This plan removes the desktop copy; the dock remains the sole desktop transport surface. Flagged as its own review-gated step (Step 4) since it's a functional change, not just a class rename.

**Ear-Candy features the mockup has no equivalent for** (guest/tag pills, the EQ "now playing" bar-indicator, loading/error/retry states, cross-catalog search-result season tags, remaining-time countdown) stay, restyled by hand to fit the ported visual language (muted `--ink-3`/`--ink-4` tones, `font-mono`/tracking-wide for anything numeric/label-like, `--ease` transitions, near-sharp radii) since there's no mockup rule to copy for these. Each step below calls out where this applies.

## Steps

### Step 1: Create the ported stylesheet and wire it in

**Files:** `client/src/styles/quiet-room.css` (new), `client/src/index.css`

**Requires review:** false

Create `client/src/styles/quiet-room.css` containing a verbatim copy of every *component* rule from the mockup's `<style>` block (lines 8-438 of the source file above) — i.e. everything from `.mono`/`.label` through the end of the `SHARE DIALOG` section — **excluding**:
- The token declarations already in `index.css`'s `:root`/`.dark` blocks (don't duplicate `--canvas` etc.).
- `#app-root *{box-sizing:border-box}`, `#app-root button{...}`, `#app-root a{...}`, `#app-root input{...}`, `#app-root :focus...` — Tailwind's `@tailwind base` (Preflight) already provides equivalent resets; verify this by inspecting a rendered button/input in the running dev app before assuming, don't just take it on faith.
- `.preview-switch`, `.toast` (tool-only chrome, see Context).
- `.shell`, `#app-root[data-viewmode=...]`, `.phone-frame`, `.shell-mobile`'s bezel-centering rules (`display:flex;justify-content:center;padding:88px 20px 60px`) — the real app has no "shell switcher"; desktop vs. mobile is already handled by this app's existing `useBreakpoint`-driven conditional rendering, not a `data-viewmode` attribute toggle. Port only the *content* rules nested inside `.shell-mobile .phone-frame` (`.m-header`, `.m-scroll`, `.m-pane`, etc.), not the frame/positioning wrapper itself.
- The `#app-root[data-theme="dark"] .art .ring-accent.two{border-color:...}` dark-mode override — keep this one, it's a real component rule (decorative ring color), just note it targets `.dark .art .ring-accent.two` instead of the `#app-root[data-theme="dark"]` mockup-tool selector, matching this app's actual dark-mode convention (`.dark` class on `<html>`, per `useTheme.ts`).

Keep every class name, property, and value otherwise unchanged from the source — including ones like `.station`, `.themeswitch`, `.admin-link`, `.eyebrow`, `.body-label` that map directly onto existing component props.

Add `@import './styles/quiet-room.css';` to `client/src/index.css` immediately after the three `@tailwind` directives, before the `@font-face` rules.

**Acceptance criteria:**
- [ ] `client/src/styles/quiet-room.css` exists and contains the full set of component rules enumerated above, with no token redeclarations and no tool-only chrome.
- [ ] `client/src/index.css` imports it right after the `@tailwind` directives.
- [ ] `make lint` and `docker compose logs client` (or equivalent dev-server check) both show no CSS/build errors — this file has previously broken the build silently past automated tests (see CLAUDE.md-adjacent history: a stray `*/` in a comment took down the whole PostCSS build without failing any test), so a real running-app check is mandatory here, not just green CI.

---

### Step 2: Port the masthead and desktop shell wrapper

**Files:** `client/src/components/Masthead.tsx`, `client/src/components/AppShell.tsx`

**Requires review:** false

Rewrite `Masthead.tsx`'s markup to use `.masthead`/`.wordmark`/`.tagline`/`.mast-right`/`.station`/`.themeswitch`/`.sep`/`.admin-link` in place of its current Tailwind classes, keeping the same props/API (`podcastName`, `tagline`, `showControls`, `isDark`, `onToggleTheme`, `onAdminClick`) and the same `aria-pressed` wiring on the Light/Dark buttons. The mobile `MobileSettingsView`'s reused theme-switch markup (see Step 6) should end up visually identical to this since both point at the same `.themeswitch` rule.

In `AppShell.tsx`, wrap the desktop branch's rendered content (currently the bare `<main>`/`<aside>` pair) in the mockup's `.room > .floor` structure so `.floor`'s `grid-template-columns:minmax(0,1fr) 372px` / `gap:104px` (and its `@media (max-width:1180px)` single-column collapse) does the actual desktop layout work, replacing this file's current `flex md:flex-row` + `w-64` sidebar sizing. Keep `AppShell`'s existing responsive branching logic (which children render in which pane, the mobile pane-focus behavior, the `--tabbar-h`/`--player-h` spacing vars) — only the desktop wrapper's own classes and grid structure change. The mobile branch's outer wrapper should NOT get `.room`/`.floor` (those are desktop-only per the mockup) — leave its current plain full-bleed layout in place; mobile-specific classes come in Step 6.

**Acceptance criteria:**
- [ ] Masthead renders with the mockup's exact spacing/typography (44px top padding, 19px wordmark, negative letter-spacing) at `md+`, verified in the running dev app.
- [ ] Desktop `.floor` grid produces a 372px-wide right column (the episode index) with a 104px gap, matching the mockup, at a wide viewport; collapses to single-column under 1180px width.
- [ ] `make test`, `make lint`, `tsc --noEmit` all pass; `Masthead.test.tsx`/`AppShell.test.tsx` updated for the new class names where they assert on classes.

---

### Step 3: Port the episode index (search, season selector, list)

**Files:** `client/src/components/EpisodeListView.tsx`, `client/src/components/EpisodeItem.tsx`, `client/src/components/SeasonTabs.tsx`, `client/src/components/PrivacyNotice.tsx`

**Requires review:** false

Rewrite these four files to use, respectively:
- `EpisodeListView.tsx`: `.index` (outer aside wrapper — note `position:sticky;top:44px` per the mockup, currently not present at all), `<p class="label">Episodes</p>`, `.index-toolbar`, `.ep-search` (keep the existing borderless-bottom-hairline behavior, it already matches — just move it onto the literal `.ep-search input` rule instead of a hand-built Tailwind equivalent), `.toolbar-row`, `.season-count` (the `data-list-status` span — e.g. "6 EPISODES" — this text doesn't exist in the app today; add it, computed from whichever list is actually rendering: search-result count while searching, else the active season's episode count), `.list`, `.empty-note` (for the "no episodes"/"loading" states).
- `EpisodeItem.tsx`: `.row`, `.row-no`, `.row-title`, `.row-time`, `.row-season-tag-inline`, plus `.row.is-viewed` for the active state (this is the class that carries the previously-discovered specificity finding — `.row.is-viewed{background:var(--surface)}` — decide explicitly here whether to port the mockup's declared rule as-is now that it's real CSS (not a Tailwind reconstruction competing with a `button{background:none}` reset that no longer applies the same way) or keep the no-background behavive found in the live mockup render; verify against the actual rendered mockup's computed style before deciding, don't assume) and `.row.is-playing` (EQ/now-playing state — the mockup only changes `.row-time`/`.row-no` color to `--accent` for this; the existing EQ-bars indicator is an Ear-Candy addition with no mockup equivalent, keep it but restyle its bars to use `--accent` and sit within the `.row` grid's third column instead of its current ad hoc flex placement).
- `SeasonTabs.tsx`: `.season-select`, `.season-trigger` (+ `.caret`), `.season-popover`, `.season-option` (+ `.opt-count`).
- `PrivacyNotice.tsx`: `.analytics` (the `<details>`/`<summary>` wrapper).

Guest/tag `PillBadge`s (an Ear-Candy addition, no mockup equivalent) stay on `EpisodeItem`/`DetailPane` but are out of scope for this step — they're addressed once in Step 4 (DetailPane) since that's their only real estate in the mockup's actual layout; `EpisodeItem`'s row never showed guests as pills in the mockup, only in the app's own desktop-only inline text (keep that inline-text behavior, restyled with `.row`'s own typography rather than removed).

**Acceptance criteria:**
- [ ] Episode list rows render full-bleed within `.index` with no padding "pill" effect, matching the mockup's `margin:22px -18px 0` list + `padding:15px 18px` row pattern.
- [ ] Season popover, search input, and season count text all match the mockup's typography/spacing, verified in the running app.
- [ ] Cross-catalog search (typing in the search box) and season switching still work exactly as before — this step changes classNames/structure only, not `EpisodeListView`'s existing search/season logic.
- [ ] `make test`, `make lint`, `tsc --noEmit` pass; `EpisodeItem.test.tsx`, `EpisodeListView.test.tsx`, `SeasonTabs.test.tsx` updated for new class names.

---

### Step 4: Port the detail pane, and remove desktop's duplicate transport controls

**Files:** `client/src/components/DetailPane.tsx`

**Requires review:** true — this step both changes markup (routine) and removes a real behavior (desktop's inline scrub/skip/speed controls), per the Context finding above.

Rewrite the desktop layout to use `.stage-head` (296px/minmax(0,1fr) grid), `.art` (+ `.rings`, `.ring-accent`, `.ring-accent.two`, `.origin`, `.art-mark`, `.art-no` — the mockup's decorative concentric-ring cover-art placeholder graphic; render these always, with the real `EpisodeCoverArt` image layered on top when art exists, since the mockup's `.art` is the *background* the image sits on, not a fallback for when there's no image), `.stage-top-row`, `.eyebrow` (+ `label` class), `.share-btn` (move `ShareDialog`'s trigger styling to match this exactly, or confirm `ShareDialog`'s own trigger button already renders inside a `.share-btn`-classed wrapper here), `.ep-title`, `.ep-meta` (+ `.dot` separators), `.controls`, `.play-primary` (+ `.play-disc`, `.play-word`, `.play-sub` — the mockup shows a duration-style subtext under "Play", e.g. "47 MIN" via `.play-sub`; wire this from `episode.duration_seconds`), `.stage-body`, `.body-label`, `.description`, `.guests` (the mockun's guests line is plain text with `<strong>` names, e.g. "With **Sam, Jordan M.**" — replace `DetailPane`'s current `PillBadge` treatment for guests with this plain-text format to match; tags have no mockup equivalent at all — decide whether to keep tag pills below the guests line, styled quietly with `--ink-3`/`--ink-4`, or drop them from the detail view entirely, and document the choice here).

Remove the entire conditional block that renders `ProgressBar`+`TransportControls` inline in the **desktop** rendering path (per the Context finding — desktop's dock is now the only transport surface). Keep it for **mobile**, restyled to `.m-now-controls`/`.m-np-scrub`/`.m-np-times`/`.m-np-transport`/`.m-np-skip`/`.m-np-speed`/`.m-np-status` (mobile keeps this because the mockup's own `.m-pane[data-m-pane=detail]` genuinely has it). This means `DetailPane.tsx` needs a breakpoint check (`useBreakpoint(MD_BREAKPOINT_QUERY)`, same hook already used elsewhere) to decide which of the two transport treatments (none inline / `.m-now-controls`) to render — desktop keeps just `.play-primary`.

Also port `.m-detail-title`/`.m-detail-meta`/`.m-detail-controls`/`.m-desc`/`.m-guests`/`.m-back` for the mobile rendering path (currently sharing markup with desktop via responsive Tailwind classes) — the mobile mockup uses different font sizes/spacing than desktop's `.ep-title`/`.ep-meta`/etc., not just a scaled-down version of the same rule, so these need their own classes applied conditionally on breakpoint, not one shared className string with responsive prefixes.

**Acceptance criteria:**
- [ ] Desktop detail view shows the big Play button and nothing else transport-related; the scrub bar, skip buttons, and speed control appear only in the fixed dock.
- [ ] Mobile detail view still shows its own scrub/skip/speed row when the viewed episode is the one currently loaded (`isCurrentPlayerEpisode`), unchanged in *behavior* from before this step, just restyled to `.m-now-controls` and friends.
- [ ] Cover art renders the mockup's concentric-ring background graphic behind the real image at all times (not just when there's no image).
- [ ] `make test`, `make lint`, `tsc --noEmit` pass; any test asserting on the removed desktop inline transport controls is rewritten to assert their absence instead.

---

### Step 5: Port the desktop dock and mobile mini-player

**Files:** `client/src/components/AudioPlayerView.tsx`

**Requires review:** false

Desktop branch: `.dock`, `.scrub` (+ `.fill`, `.knob` — replace the current native `<input type=range>`-based `ProgressBar` usage here with the mockup's own div-based scrub bar markup/behavior, since `.scrub`'s hover-reveal knob and thin 2px track have no equivalent as a styled `<input type=range>`; keep the underlying seek logic, i.e. `onSeek`/`handleSeek`, wired to `onClick`/drag on the new markup instead of an `onChange`), `.dock-inner`, `.now` (+ `.chip` with its own `.rings`/`.origin` mini decorative graphic, `.now-text`, `.now-title`, `.now-sub` — a mono uppercase subtext under the title; wire this from something meaningful, e.g. the season/episode label, since the mockup's own demo data used a station-style tagline here), `.transport` (+ `.skip` ×2, `.pause-disc`), `.dock-right` (+ `.times`, `.speed`), `.status` (the mockun's `role=status` line for e.g. "SEEKING…" — map this to the existing `PlaybackStatusLine`/`getPlaybackStatus` plumbing rather than inventing new status text).

Mobile branch: `.m-miniplayer` (+ `.m-mini-progress`/`.fill`, `.chip`, `.now-text`/`.now-title`, `.m-mini-play`). Keep the existing `onTapMiniBar` behavior (tapping the bar outside the play button navigates to the Playing tab) — the mockup's own JS does the same thing structurally (`.m-miniplayer` is a full clickable row with a nested play button that presumably stops propagation), so this maps directly.

Loading/error/retry states (Ear-Candy additions, no mockup equivalent) stay wired to the same buttons/icons as today, restyled to fit (e.g. the existing `RetryIcon` swapped in for `.pause-disc`'s icon when `error` is true, same as now).

**Acceptance criteria:**
- [ ] Desktop dock matches the mockup's layout/spacing/shadow exactly, including the always-present (opacity/scale-animated) scrub knob on hover.
- [ ] Mobile mini-player matches the mockup's compact row layout.
- [ ] Real playback (play/pause/seek/skip/speed) still works end-to-end after the scrub-bar markup change — verify by actually pressing play and dragging/clicking the new scrub bar in the running dev app, not just reading the code.
- [ ] `make test`, `make lint`, `tsc --noEmit` pass; `AudioPlayerView.test.tsx` updated for the new scrub-bar markup (tests that currently query the `<input type=range>` need rewriting against the new clickable div).

---

### Step 6: Port the mobile shell chrome (tab bar, settings pane, list pane wrapper)

**Files:** `client/src/components/MobileTabBar.tsx`, `client/src/components/MobileSettingsView.tsx`, `client/src/components/AppShell.tsx`, `client/src/components/EpisodeListView.tsx`

**Requires review:** false

- `MobileTabBar.tsx`: use `.m-tabbar` and its button/`::after` indicator rule in place of the current hand-built active-indicator markup (the mockup does the accent underline via a pseudo-element toggled by `[aria-current="true"]`, not a separately-rendered `<span>` — match that, i.e. rely on `aria-current` + the ported CSS rather than conditionally rendering an indicator element).
- `MobileSettingsView.tsx`: use `.m-settings-row`/`.m-settings-label`, and reuse the same `.themeswitch`/`.station`/`.admin-link` classes from Step 2 (the mockup's own mobile settings pane reuses these exact classes, per its markup at lines 703-717) rather than this file's own bespoke row styling.
- `AppShell.tsx`'s mobile branch: wrap mobile content in `.m-scroll`/`.m-pane`(`.active`) so the mockup's pane-switching CSS (`display:none` / `.active{display:block}`) matches — note this app already conditionally *renders* only the active pane via React (`focusedPane === 'list' ? sidebar : ...`), so `.m-pane.active` here is really just the always-true state for whichever pane React chose to render; the `.m-pane` class still matters for its `padding-bottom:28px`, and `.m-scroll`'s own scroll/overflow rules replace this file's current ad hoc `overflow-y-auto`.
- `EpisodeListView.tsx`'s mobile branch: wrap the list pane's own top chrome in `.m-header`-adjacent structure is Masthead's job (already global, not per-pane) — but the list pane's search/season-row/list use `.m-ep-search`/`.m-count`/`.m-list` instead of the desktop `.ep-search`/`.season-count`/`.list` classes ported in Step 3 (the mobile versions have different sizing per the mockup's own separate `.m-*` rules), selected via the existing `useBreakpoint` check already present in this file.

**Acceptance criteria:**
- [ ] Mobile tab bar's active-tab underline is driven by `aria-current` + CSS, not a manually rendered indicator element.
- [ ] Mobile settings pane visually matches the mockup's `.m-settings-row` spacing/border-top-only-between-rows treatment.
- [ ] Mobile list pane uses the `.m-*`-prefixed sizing, distinct from desktop's, matching the mockup at a real phone-width viewport.
- [ ] `make test`, `make lint`, `tsc --noEmit` pass; `MobileTabBar.test.tsx`, `MobileSettingsView.test.tsx`, `EpisodeListView.test.tsx` updated.

---

### Step 7: Port the mobile season picker

**Files:** `client/src/components/SeasonPicker.tsx`

**Requires review:** false

Rewrite to use `.m-season-picker`, `.m-season-picker-close`, `.m-season-picker-title`, `.m-season-picker-list` (reusing the shared `.season-option`/`.opt-count` classes from Step 3 for the list items, per the mockup's own `.m-season-picker-list .season-option{padding:16px 2px;font-size:15.5px}` override). Keep the existing focus-trap/Escape/outside-close behavior and portal-to-`document.body` approach unchanged — only the classes and DOM structure of what's portaled changes.

**Acceptance criteria:**
- [ ] Full-screen season picker matches the mockup's layout (close button top-left, title, scrollable option list) and typography.
- [ ] Focus trap, Escape-to-close, and selection behavior all still work, verified interactively.
- [ ] `make test`, `make lint`, `tsc --noEmit` pass; `SeasonPicker.test.tsx` updated for new class names.

---

### Step 8: Port the share dialog

**Files:** `client/src/components/ShareDialog.tsx`

**Requires review:** false

Rewrite to use `.share-backdrop`, `.share-panel`, `.share-title`, `.share-sub` (the mockup shows a subtitle here, e.g. an episode-title recap — wire this from `episodeTitle`), `.share-url-row` (+ `.share-url`, `.share-copy`), `.share-dests` (+ its plain-text `button`/`a` children — already matches current Bluesky-as-plain-text-link treatment from plan 009, just move onto the literal class), `.share-close` (the mockup uses a plain text "Close" control at the bottom, not an icon-only × button in the header — replace the current `×`-icon close button accordingly, but keep it operating the same `closeDialog` handler, and keep an icon-free `aria-label="Close share dialog"` equivalent achieved via the visible "Close" text itself needing no separate aria-label). Keep the existing timestamp checkbox (`offersTimestamp`/`includeTimestamp`), an Ear-Candy addition with no direct mockup equivalent — place it wherever fits naturally in the ported layout (between `.share-url-row` and `.share-dests` matches the mockup's general information order) and style it quietly with `.share-sub`-equivalent muted text.

**Acceptance criteria:**
- [ ] Share dialog matches the mockup's layout on both desktop (centered panel) and mobile (bottom sheet), including the plain-text "Close" control replacing the icon-only close button.
- [ ] Copy-link, timestamp checkbox, and Bluesky share link all still function.
- [ ] `make test`, `make lint`, `tsc --noEmit` pass; `ShareDialog.test.tsx` updated (the close-button query in particular, since its accessible name/role changes).

---

### Step 9: Full quality gate + fix any test fallout

**Files:** any remaining test files not already updated in Steps 2-8

**Requires review:** false

Run `make test`, `make lint`, and `tsc --noEmit` (per repo convention, via `make` targets, not raw `npm`) across the whole client. Fix any remaining failures — this step exists to catch cross-file breakage (e.g. a shared test helper referencing an old class name, or `App.test.tsx` asserting on structure changed in Step 2/6) that isn't cleanly attributable to a single earlier step. Do not defer any red test past this step.

**Acceptance criteria:**
- [ ] `make test` fully green (server tests untouched/unaffected — this plan is client-only).
- [ ] `make lint` clean.
- [ ] `tsc --noEmit` clean.

---

### Step 10: Live verification against the mockup, desktop and mobile

**Files:** none (verification only)

**Requires review:** false

Start the dev stack (`make up`) and compare the running app directly against the mockup file, side by side, at both a desktop width and a real mobile viewport width (~390px) — for at least: masthead, episode list (including an active/viewed row, and a played/EQ-indicated row), desktop detail pane (cover art, title, play button, no inline transport), mobile detail pane (with inline transport visible on the currently-playing episode), desktop dock, mobile mini-player, season popover (desktop) and full-screen season picker (mobile), and the share dialog (desktop and mobile). Use the seeded mock data already present in the local dev DB (2 seasons, 9 episodes, real cover art, guests, tags — added specifically to support this kind of comparison) rather than re-seeding.

Report back concretely what matches and what doesn't, the same way prior verification rounds in this session did — screenshots plus a clear list of any remaining discrepancies, not just "looks good."

**Acceptance criteria:**
- [ ] Screenshots captured for every state listed above, at both breakpoints.
- [ ] Any remaining discrepancy from the mockup is explicitly listed, not silently accepted.

## Testing

Every step that touches a component updates that component's existing unit test file in the same step (per this repo's testing convention — new behavior or restructured markup ships with updated coverage in the same step, never deferred). Prefer updating tests to assert on accessible roles/text/behavior over exact class-name strings where the existing test already does so; where existing tests already assert exact Tailwind class names (e.g. `EpisodeItem.test.tsx`'s active-state test), update those assertions to the new literal mockup class names rather than removing the coverage. No new component files are introduced by this plan — it is a rewrite of existing components' markup/styling, not new functionality — so no wholly new test files are expected, only updates to existing ones. Step 9 is the explicit catch-all for anything that slips between steps.

## Notes

- **Why a new stylesheet file instead of merging into `index.css` directly:** `index.css` already carries the token layer, font-face rules, and a couple of hand-written utility classes (`.eq-bar`); keeping the mockup's ~250 lines of component rules in their own file makes it possible to diff this plan's changes against the mockup source directly, file-to-file, rather than against an interleaved file. Both are imported into the same cascade either way — this is an organizational choice, not a behavioral one.
- **Why global classes, not CSS modules or `@apply`:** the mockup itself is one flat global stylesheet with descendant-combinator selectors (`.row:hover .row-title`, `.season-trigger[aria-expanded="true"] .caret`); reproducing it faithfully is far more direct as literal global CSS than as scoped modules or a wall of `@apply` one-liners that would just reconstruct the same rules through an extra layer of indirection.
- **Alternative considered and rejected:** keep translating property-by-property into Tailwind, but with stricter cross-checking (e.g. a computed-style diff script against the mockup for every component). Rejected because three plans already tried increasingly rigorous versions of this and each still drifted — the user's own request (port the actual assets) is the more reliable fix, not a process improvement on the translation step.
- **Step 4's review gate** is the one place this plan changes behavior a user could notice beyond pure restyling (desktop loses its inline transport controls in the detail pane). Everything else preserves existing behavior/props while changing only markup and CSS classes.
- Plans 007/008/009 are left as-is (not marked complete or superseded in their own frontmatter) — this plan supersedes their approach in practice, but rewriting their history isn't this plan's job.
