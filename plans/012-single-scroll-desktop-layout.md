---
id: single-scroll-desktop-layout
title: "Desktop: convert to the mockup's single-scroll, sticky-sidebar layout"
status: complete
priority: 1
created: 2026-09-08
steps_completed: 4
steps_total: 4
tags: [design-system, ux, frontend, visual-fidelity, layout]
---

# Desktop: Single-Scroll, Sticky-Sidebar Layout

## Summary

Confirmed empirically (real `getComputedStyle()`/scroll-event checks, not just source reading): the mockup has no scroll containers on desktop at all — `.stage` and `.index` both compute to `overflow-y: visible`, and the whole document scrolls as one unit, with `.index{position:sticky;top:44px}` doing all the work of keeping the episode list visually anchored near the top as the page scrolls. The current app instead gives `main.stage` and `aside.index` each their own independent `overflow-y: auto` region inside a viewport-height-locked shell — confirmed the two panes scroll completely independently, and the page itself never moves. This plan converts the desktop layout to match the mockup's real single-scroll model.

## Context

**Decision made here, not left open:** matching "single scroll" faithfully also means the masthead scrolls away with the rest of the page — `.masthead` has no `position` property in the mockup at all, so it's not pinned. The current app's masthead never moves (it sits outside the two independent scroll regions, in a viewport-locked shell). This plan makes it scroll away on desktop, consistent with actually matching the mockup rather than a partial version of it.

**Desktop only.** Mobile already matches the mockup's own model for that breakpoint and is untouched by this plan: the mockup's mobile shell is itself a bounded, fixed-height "phone frame" with its own internal `.m-scroll{flex:1;overflow-y:auto}` region (confirmed via source — this is the one place besides `.season-popover`/`.art`/`.chip` where the mockup deliberately declares `overflow-y:auto`), and `AppShell.tsx`'s mobile branch already implements exactly that shape. Do not touch the mobile branch, `MobileTabBar`, or `.m-scroll`/`.m-pane` in this plan.

**Root cause of the current independent-pane setup:** `AppShell.tsx` (`client/src/components/AppShell.tsx`) wraps the whole app in a single `<div className="flex h-dvh flex-col overflow-hidden ...">` shared by both breakpoints, then on desktop gives `main.stage` and `aside.index` their own `overflow-y-auto`, with `.floor`'s own `align-items:start` overridden to `items-stretch` so both panes stretch to fill the locked shell height — none of which exists in the mockup. The `--player-h`/`--tabbar-h` dock-clearance padding is currently applied per-pane (`paneStyle`, both `main` and `aside`) rather than once at the page level, which only made sense under the independent-scroll model.

**A second, related bug found while reading the code for this plan (not previously caught):** `EpisodeListView.tsx`'s own `.list`/`.m-list` div (`client/src/components/EpisodeListView.tsx:118`) *also* carries `flex-1 overflow-y-auto overflow-x-visible` — a second, nested, redundant scroll region inside `aside.index` (which already had its own `overflow-y-auto`). The mockup's `.list`/`.m-list` declare no `overflow` at all. This has been dormant (nested `overflow-y-auto` on content that never needed to scroll independently doesn't visibly misbehave) but is wrong on both desktop and mobile and gets fixed here since it's the same "the list should just be part of one flowing scroll, not its own region" issue this plan is about.

**Files involved:** `client/src/components/AppShell.tsx` (the actual layout/scroll-model change), `client/src/components/EpisodeListView.tsx` (drop the redundant overflow classes on `.list`/`.m-list`), `client/src/tests/AppShell.test.tsx` (the one existing test that asserts on the old per-pane padding model), `client/src/tests/EpisodeListView.test.tsx` (check for any assertion on the removed classes).

**Not in scope:** anything about `.stage`/`.index`'s own typography, spacing, or content (already settled by plans 010-011); the mobile shell; the fixed dock/player itself (`.dock{position:fixed}` already matches the mockup exactly and needs no change — it stays fixed regardless of how the page around it scrolls).

## Steps

### Step 1: Convert `AppShell.tsx`'s desktop branch to real single-page scroll

**Files:** `client/src/components/AppShell.tsx`

**Requires review:** true — this changes the fundamental scroll/layout model for the whole desktop shell (not a spacing/color tweak), including the masthead no longer being permanently visible while scrolling. Confirm the rendered result looks and feels right before moving on, not just that it compiles.

Split the component's single shared return into two genuinely separate branches (desktop vs. mobile), rather than one shared root wrapper with conditional children:

- **Desktop:** no height lock, no shell-level `overflow-hidden`. The root becomes a plain `flex flex-col bg-canvas` div (or simpler — normal block flow works too, since nothing needs to stretch to a fixed height anymore) containing `{masthead}` then `.room` in normal document flow. `.room` keeps `w-full` (still needed — it's a flex item of whatever wraps it, and `.room`'s own `margin:0 auto` centering still collapses to content width without it, per the earlier confirmed bug in plans/010) but drops `flex-1`/`overflow-hidden`/the `pb-0` Tailwind-utility workaround. Dock-clearance padding moves from per-pane (`main`/`aside`) to `.room` itself: `style={{ paddingBottom: 'calc(var(--player-h, 0px) + env(safe-area-inset-bottom, 0px))' }}` (no `--tabbar-h` term — that only exists for mobile). `.floor` drops the `items-stretch` override entirely, letting its own declared `align-items:start` apply (content-sized columns, exactly matching the mockup — stretching was only ever needed so the two panes could each fill a locked height for independent scrolling). `main.stage` and `aside.index` drop `overflow-y-auto` (and `.index` also drops `overflow-x-visible`, no longer needed once there's no competing `overflow-y` on the same element to trigger the "one non-visible axis forces both to auto" behavior) and drop their own per-element `paneStyle` — they become plain, unconstrained block/grid children. `.index{position:sticky;top:44px}` (already present in `quiet-room.css` from plan 010, previously inert since `.index` was its own scroll container) will now actually engage, matching the mockup.
- **Mobile:** unchanged, byte-for-byte — keep the existing `h-dvh overflow-hidden` shell, `.m-scroll`, `.m-pane`, tab bar, and `paneStyle` (still needs both `--player-h` and `--tabbar-h` there).

The `mainRef`/focus-management `useEffect` (`if (!isDesktop) mainRef.current?.focus()`) is unaffected — it already no-ops on desktop and only matters for mobile's pane-switch focus management.

**Acceptance criteria:**
- [ ] On desktop, `document.body`/`window` scrolling moves the whole page — verified by an actual scroll/wheel event in a running browser, not just reading the CSS (this exact class of "looks right in source, wrong when rendered" mistake has bitten this project twice already this week).
- [ ] `main.stage` and `aside.index` compute `overflow-y: visible` (or omit the property entirely) on desktop.
- [ ] The masthead scrolls out of view when scrolling down far enough on desktop.
- [ ] `aside.index` visibly sticks near the top of the viewport once scrolled past its natural position, and un-sticks once the (presumably taller) `.stage` content beside it runs out.
- [ ] The fixed dock/player bar still stays pinned to the bottom of the viewport regardless of scroll position.
- [ ] Mobile is pixel-identical to before this step — verify with a real screenshot comparison, not just "I didn't touch that branch."

---

### Step 2: Remove the redundant nested scroll region from `EpisodeListView.tsx`

**Files:** `client/src/components/EpisodeListView.tsx`

**Requires review:** false

Change line 118 from:
```tsx
<div className={`${isDesktop ? 'list' : 'm-list'} flex-1 overflow-y-auto overflow-x-visible`}>
```
to:
```tsx
<div className={isDesktop ? 'list' : 'm-list'}>
```
matching the mockup exactly (`.list`/`.m-list` declare no `overflow`/`flex` properties at all). This applies to both breakpoints — the redundant nested scroll was present (dormant) on mobile too, inside `.m-scroll`, not just on desktop inside the old independently-scrolling `aside.index`.

**Acceptance criteria:**
- [ ] `.list`/`.m-list` computes `overflow-y: visible` on both breakpoints.
- [ ] Episode list still renders and scrolls correctly as part of the single page scroll (desktop) / `.m-scroll` region (mobile) — no content clipping, no double scrollbars.

---

### Step 3: Update tests for the new layout model

**Files:** `client/src/tests/AppShell.test.tsx`, `client/src/tests/EpisodeListView.test.tsx` (check only — likely no change needed there since it doesn't assert on the removed utility classes, but confirm)

**Requires review:** false

`AppShell.test.tsx`'s `'aside reserves the same bottom padding as main for the fixed player bar'` test currently asserts `aside.style.paddingBottom === main.style.paddingBottom` and that it contains `var(--player-h`. Rewrite it to reflect the new model: on desktop, neither `main` nor `aside` carries an inline `paddingBottom` at all — the reservation now lives on `.room` (the element wrapping both). Assert the `.room` element's `style.paddingBottom` contains `var(--player-h` instead, and that `main`/`aside` no longer have their own. Add a new test confirming mobile's `main.m-scroll` *does* still carry its own `paddingBottom` referencing both `var(--player-h` and `var(--tabbar-h` (the mobile model is unchanged, but nothing currently pins that down as a regression guard now that desktop's mechanism has diverged from it).

**Acceptance criteria:**
- [ ] Updated/new tests pass and actually assert on the new structure (not just weakened to stop failing).
- [ ] `make test` (client) green.

---

### Step 4: Full quality gate + live verification

**Files:** none (verification only)

**Requires review:** false

Run `make test`, `make lint`, and (from `client/`) `npx tsc --noEmit`. Then, with the dev stack running, verify live in a real browser at a desktop width:
1. Scroll the page with real seeded episode data (enough episodes that `.stage`'s detail content and `.index`'s episode list are meaningfully different heights) and confirm: the masthead scrolls away, the episode list sticks near the top of the viewport while the detail content beside it keeps scrolling, and the dock stays fixed at the bottom throughout.
2. Confirm no layout regression in the episode row rendering itself (plans 010/011's row-height and active-highlight fixes) — this plan shouldn't touch row styling, but confirm nothing shifted as a side effect of the container changes.
3. Confirm mobile is unaffected — screenshot comparison against pre-change mobile behavior.
4. Run the full e2e suite (`make e2e`) — several specs click through list→detail navigation and check focus/visibility; confirm nothing relied on the old independent-scroll behavior implicitly (e.g., a test scrolling one pane and asserting the other didn't move would need updating, though a search of the current specs during planning didn't turn up any such assertion).

**Acceptance criteria:**
- [ ] `make test`, `make lint`, `tsc --noEmit` all green.
- [ ] Full `make e2e` suite green (or any real fallout fixed, not worked around).
- [ ] All four live-verification checks above explicitly confirmed, not assumed.

## Testing

Steps 1-2 are layout/CSS-class changes with no new component logic — Step 3 updates the one existing test that encoded the old model plus adds one new regression guard for mobile's now-divergent mechanism. Step 4 is the real test: this exact class of bug (source looks right, rendered behavior doesn't match) has already happened twice in this project, so live verification via actual scroll events and screenshots is mandatory, not optional, before calling this done.

## Notes

- The masthead-scrolls-away behavior is the one part of this plan that's a genuine UX judgment call dressed up as a fidelity fix. It's being made here (scroll away, matching the mockup) rather than left as a follow-up question, consistent with this project's established pattern of choosing mockup-fidelity over convenience when the two conflict — but it's flagged with its own review gate (Step 1) specifically so it gets a real look before shipping, since "the nav disappears when you scroll" is a bigger felt change than anything in plans 010-011.
- If Step 1's live check finds the sticky sidebar doesn't visibly "do" anything (e.g., because `.stage` content is routinely about the same height as `.index`'s list, leaving no room to stick), that's expected, content-dependent behavior matching the mockup's own design — not a bug to chase.
