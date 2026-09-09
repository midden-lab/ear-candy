---
id: quiet-room-completion
title: "Quiet Room completion — masthead, pane order, IconRail, share-control fixes"
status: complete
priority: 1
created: 2026-09-06
steps_completed: 9
steps_total: 9
tags: [design-system, ux, frontend, redesign, shell, accessibility]
---

# Quiet Room Completion

## Summary

Closes the real, fully-verified remaining gap between Ear Candy's listener UI and the settled "Quiet Room" design (https://claude.ai/code/artifact/45ce2080-cfd2-4bcc-91c0-5475ec994055). This plan supersedes plan 006, which implemented the correct fix but was reverted from production after a trust breakdown over whether it actually matched the mockup — it did, but was reverted before that was established with enough rigor. This time the scope is grounded in two independent, verified sources: two new standalone, interactive, self-contained reference mockups (`plans/007-mockups/desktop.html`, `plans/007-mockups/mobile.html` — built directly from the real mockup's saved source, exercised end-to-end, bugs found and fixed) and a fresh whole-page audit of the current (reverted) real codebase against them.

**Do not implement this plan until the user has reviewed `plans/007-mockups/desktop.html` and `plans/007-mockups/mobile.html` directly** (open them in a browser — no build step) **and confirmed they match the intended design.** That review is the explicit gate this plan exists to satisfy before any code changes happen again.

## Context

**Important, non-obvious finding that changes this plan's scope versus plan 006's:** the production revert only reverted plan 006's single commit (masthead, pane order, `IconRail`). It did **not** touch plan 005's earlier, separate work — which is still live and, per today's fresh audit, still correct: the `--canvas`/`--surface`/`--ink-*` token layer, Archivo/IBM Plex Mono fonts, the desktop season dropdown + mobile full-screen season picker, cross-catalog search, `MobileTabBar`'s icon-free/always-enabled/correctly-scoped-active-state behavior, `DetailPane`'s conditional scrub/skip/speed controls, and `EpisodeItem`'s surface/shadow (not border) active-row styling are all **already done** and must not be re-touched by this plan. `plans/004-quiet-room-design-system.md`'s "Component mapping" table describes an older state of the code and is stale on every one of these points — do not use it as a source of truth for what's missing; use this document's Steps instead.

**What's actually still wrong, confirmed directly against the real files:**

1. **No masthead exists.** The podcast wordmark is a small heading buried inside `EpisodeListView.tsx` (only visible on the Episodes pane); `Settings.tagline` (`client/src/types.ts` line 3) is fetched but never rendered anywhere; the theme toggle is a floating `fixed bottom-4 right-4` badge (`AppShell.tsx` lines 81-85, desktop only); Admin is only reachable via `IconRail.tsx`'s gear icon.
2. **Desktop pane order is inverted relative to the mockup.** `AppShell.tsx` renders the episode list (`aside`, `w-64`) first/left and the detail view (`main`) second/right. The mockup's `.floor` has the detail/stage as the wide first column (left) and the episode index as a fixed 372px second column (right).
3. **`IconRail.tsx` has no mockup equivalent** and its own two live icon buttons ("Seasons," "Search") are dead code gated behind `SEASONS_AND_SEARCH_ENABLED = false` (line 9) — the functionality they'd gate (season switching, search) is already fully implemented elsewhere.
4. **`ShareDialog.tsx`'s trigger is icon-only** (`aria-label`, no visible text — lines 130-145), but the settled design specifies icon **+ "Share" text** in a corner row (confirmed directly in the mockup's `.share-btn` markup).
5. **The share trigger's icon doesn't match the transport-icon family.** Real: a generic three-node "share" glyph. Mockup: a custom arrow-out-of-tray glyph deliberately drawn with the same stroke-width as the skip±15 icons.
6. **The share trigger is still duplicated.** `DetailPane.tsx` correctly renders one (lines 94-101, per plan 005). `AudioPlayerView.tsx` line 332 *also* still renders one in the desktop full player bar — plan 005's own stated goal ("remove `AudioPlayerView.tsx`'s two existing render sites," per `plans/004` line 95) was only half-finished; the mobile mini-bar's copy was removed, the desktop one wasn't.
7. **`SeasonTabs.tsx`'s popover has no focus management at all** (only outside-click + Escape, no `.focus()` calls) — confirmed directly in the file. `SeasonPicker.tsx`'s full-screen dialog does move focus to its close button on open and restores it on close, but has no Tab-trap, so Tab can leak from the picker to the (visually hidden, but still in the DOM) page behind it.
8. **Not a gap, confirmed and ruled out:** `ProgressBar.tsx` uses a native `<input type="range">`, which has full keyboard support (arrow keys, Home/End) built into every browser for free — the standalone mockup's custom `role="slider"` div lacked this, but the real component never had this problem.
9. **Not a gap, confirmed and ruled out:** `ShareDialog.tsx` already has a complete, correct focus trap (moves focus to its close button on open, restores focus to the trigger on close, traps Tab/Shift+Tab within the panel, closes on Escape) — the standalone mockup's simplified share dialog lacked this, the real component doesn't.
10. **Not a gap, confirmed and ruled out:** the "duplicate transport controls" the mockup review flagged (mini-player dock + `DetailPane`'s inline transport both visible when viewing the actively-playing episode) is real in both the mockup and the shipped app — and is the same pattern every mainstream podcast/music app uses (a persistent mini-player plus full controls on the "now playing" screen). CLAUDE.md gotcha #43b documents this as an intentional, already-decided pattern in this codebase ("three independent Play buttons... not a shared component"). No change needed.

**Files involved:** `client/src/components/Masthead.tsx` (new), `client/src/components/AppShell.tsx`, `client/src/components/IconRail.tsx` (deleted), `client/src/components/EpisodeListView.tsx`, `client/src/components/EpisodeList.tsx`, `client/src/App.tsx`, `client/src/components/ShareDialog.tsx`, `client/src/components/AudioPlayerView.tsx`, `client/src/components/SeasonTabs.tsx`, `client/src/components/SeasonPicker.tsx`, plus corresponding test files and `e2e/fixtures.ts`/`e2e/tests/admin.spec.ts`/`e2e/tests/screenshot.spec.ts`/`e2e/tests/theme.spec.ts`.

## Decisions (resolved with the user 2026-09-06)

- **Masthead station callout.** Include it, but as a **hardcoded string** in `Masthead.tsx` for now — not backed by a real settings field. Ear Candy has no `station` field in `Settings` today, and adding one (migration + admin UI + API) is explicitly deferred as a separate follow-up decision, not part of this plan. Removing the hardcoded text entirely is also an option at that later point.
- **Tagline.** Yes — surface `Settings.tagline` in the masthead. It already exists, is already populated in production (`"A show about things"`, confirmed live via `GET /api/settings`), and has never been rendered anywhere in the listener-facing app until now.

## Steps

### Step 1: Build `Masthead.tsx`

**Files:** `client/src/components/Masthead.tsx` (new), `client/src/tests/Masthead.test.tsx` (new), `client/src/components/MobileSettingsView.tsx`, its test file
**Requires review:** false

Full-width header: wordmark (`podcastName`) + tagline (`Settings.tagline`) on the left. When `showControls` is true (desktop only — mobile shows just the wordmark/tagline, persistently, across all three tabs), render on the right: a hardcoded station string (`"KDUR 91.9 / 93.9 FM"` — a literal string constant, not sourced from `Settings`; see this plan's Decisions section on why), a `Light`/`Dark` text-toggle pair (two buttons, `aria-pressed`, matching `plans/007-mockups/desktop.html`'s `.themeswitch` — not the emoji `ThemeBadge`), and a plain-text `Admin` button (not a real `<a href>`, consistent with this app's client-side view switching). No icons anywhere in this component.

```ts
interface MastheadProps {
  podcastName: string
  tagline: string
  showControls?: boolean
  isDark?: boolean
  onToggleTheme?: () => void
  onAdminClick?: () => void
}
```

Also add the same hardcoded station string as a row in `MobileSettingsView.tsx` (mirroring `plans/007-mockups/mobile.html`'s `.m-settings-row` "Station" row) — the mobile masthead itself stays wordmark/tagline-only, matching the mockup's persistent `.m-header`.

**Acceptance criteria:**
- [ ] Renders `podcastName`/`tagline` unconditionally; renders no controls when `showControls` is false/omitted.
- [ ] `showControls=true` renders the station string, `Light`/`Dark` with `aria-pressed` reflecting `isDark` wired to `onToggleTheme`, and `Admin` wired to `onAdminClick`.
- [ ] `MobileSettingsView` shows the same station string in a settings row.
- [ ] New test file covers all of the above.

---

### Step 2: Restructure `AppShell.tsx`

**Files:** `client/src/components/AppShell.tsx`, `client/src/tests/AppShell.test.tsx`
**Requires review:** true (changes the layout of every listener-facing screen)

Replace the `rail`/`themeBadge` props with a single `masthead: ReactNode` prop, rendered once above everything else on both desktop and mobile. Swap the desktop two-column order: `detail` becomes the `flex-1 main` (left), `sidebar` becomes the fixed `w-64` `aside` (right, `border-l` instead of `border-r`). Remove the floating fixed-position theme-badge block entirely — the desktop theme toggle now lives in the masthead.

**Acceptance criteria:**
- [ ] `AppShellProps` has `masthead`, no `rail`/`themeBadge`.
- [ ] Desktop: masthead full-width on top; `detail` is the left/main column; `sidebar` is the right/`w-64` column.
- [ ] No floating fixed-position element renders anywhere in `AppShell`'s own output.
- [ ] Mobile: masthead renders above the single swappable pane, on all three tabs (list/detail/settings).

---

### Step 3: Wire `Masthead` into `App.tsx`; delete `IconRail` usage

**Files:** `client/src/App.tsx`
**Requires review:** false

Remove the `IconRail` import/usage. Build and pass a `masthead` element using `settings.podcast_name`, `settings.tagline`, `useBreakpoint(MD_BREAKPOINT_QUERY)` for `showControls`, and the existing `isDark`/`toggleDark`/`handleAdminClick`. Leave the separate `themeBadge` construction and its use inside `MobileSettingsView` untouched — that path is correct and unrelated.

**Acceptance criteria:**
- [ ] No reference to `IconRail` remains in `App.tsx`.
- [ ] Mobile Settings tab's theme toggle still works unchanged.

---

### Step 4: Remove the duplicate podcast-name header from `EpisodeListView`/`EpisodeList`

**Files:** `client/src/components/EpisodeListView.tsx`, `client/src/components/EpisodeList.tsx`, and their tests
**Requires review:** false

Delete both `<h2>{podcastName}</h2>` blocks; remove the now-unused `podcastName` prop from both components and their call sites.

**Acceptance criteria:**
- [ ] Neither component renders a podcast-name heading; `podcastName` prop removed everywhere.

---

### Step 5: Delete `IconRail.tsx`

**Files:** `client/src/components/IconRail.tsx` (deleted), `client/src/tests/IconRail.test.tsx` (deleted)
**Requires review:** false

Delete both files. `grep -rn IconRail client/src` must return nothing afterward.

---

### Step 6: Fix `ShareDialog.tsx`'s trigger — icon+text, matching icon family, single render site

**Files:** `client/src/components/ShareDialog.tsx`, `client/src/components/AudioPlayerView.tsx`, their tests
**Requires review:** false

Three independent fixes to the trigger button (lines 130-145 of `ShareDialog.tsx`):
1. Add visible text "Share" next to the icon (currently icon-only with just an `aria-label`).
2. Replace the three-node icon with an arrow-out-of-tray glyph using the same stroke-width as the skip±15 icons in `TransportControls.tsx` (check that file for the exact stroke-width value to match) — see `plans/007-mockups/desktop.html` lines 262-268 for the exact path data to adapt.
3. Remove `AudioPlayerView.tsx` line 332's `<ShareDialog .../>` render (the desktop full player bar's copy) — `DetailPane.tsx`'s copy (already correctly placed per plan 005) is the single remaining render site, matching the mockup and matching plan 005's original, only-half-completed intent.

**Acceptance criteria:**
- [ ] `ShareDialog`'s trigger shows both an icon and the word "Share".
- [ ] Icon stroke-width matches `TransportControls.tsx`'s skip-icon stroke-width exactly.
- [ ] `grep -n ShareDialog client/src/components/AudioPlayerView.tsx` returns nothing.
- [ ] Existing `ShareDialog`/`AudioPlayerView`/`DetailPane` tests updated for the new trigger content and the removed render site.

---

### Step 7: Add focus management to `SeasonTabs.tsx`'s popover

**Files:** `client/src/components/SeasonTabs.tsx`, its test file
**Requires review:** false

On open, move focus to the first option (or the popover container if that reads better given the existing keyboard-nav pattern). On close (via selection, outside-click, or Escape), restore focus to the trigger button. Add a Tab-trap within the popover while open, matching the pattern already implemented correctly in `ShareDialog.tsx` (reuse its approach/a shared helper if that's a clean fit — check before introducing a duplicate implementation). Also add a Tab-trap to `SeasonPicker.tsx`'s full-screen dialog, which already moves initial focus correctly but doesn't trap it.

**Acceptance criteria:**
- [ ] Opening the desktop season popover moves focus into it; closing it (any method) restores focus to the trigger.
- [ ] Tab/Shift+Tab cannot leave either the desktop popover or the mobile full-screen picker while open.
- [ ] New/updated tests cover focus entry, trap, and restoration for both components.

---

### Step 8: Update client unit tests and e2e tests for the new Admin entry point and shell shape

**Files:** `client/src/tests/App.test.tsx`, `e2e/fixtures.ts`, `e2e/tests/admin.spec.ts`, `e2e/tests/screenshot.spec.ts`, `e2e/tests/theme.spec.ts`
**Requires review:** false

Same mechanical updates plan 006 already worked out and verified: replace `'Admin settings'` queries with the masthead's `Admin` control everywhere (client tests and `e2e/fixtures.ts`'s `adminPage` fixture); rewrite `theme.spec.ts` for the masthead's `Light`/`Dark` buttons instead of the floating badge; fix `admin.spec.ts`'s "Sign out returns to the listener UI" test's `<nav>`-landmark assertion (IconRail's `<nav>` no longer exists — assert the masthead's `Admin` control is visible again instead).

**Acceptance criteria:**
- [ ] No test references `'Admin settings'`, `IconRail`, or a desktop `<nav>` landmark that no longer exists.
- [ ] Full local `make test`/`make lint`/typecheck pass.
- [ ] Full local `make e2e` run reviewed test-by-test against CI's eventual result on the `main`-targeting PR — do not wave off any failure as "pre-existing" without confirming it by name against a clean, non-interfered-with local run first (see the process failure this exact step caused during plan 006's execution: don't seed/mutate the local dev DB while `make e2e` is running).

---

### Step 9: Manual + automated verification against the real mockups (no shipping without this)

**Files:** none
**Requires review:** true (this is the ship/no-ship gate)

Before opening any PR: get the user's explicit confirmation that `plans/007-mockups/desktop.html` and `mobile.html` match their intent (per this plan's header note). After implementing Steps 1-8 and passing the full local quality gate, run the dev stack (`make up`) and manually compare the real app, side by side, against the two mockup files — not screenshots taken in isolation and reasoned about after the fact, the two windows open at once. After shipping through the normal branch → PR → dev → PR → main pipeline (with CI's real e2e run against the production image as the actual automated gate), repeat the same side-by-side comparison against live production before considering this plan done.

**Acceptance criteria:**
- [ ] User has reviewed and approved the two mockup files.
- [ ] Real dev app, side by side with the mockups, matches on: masthead (wordmark/tagline/Light-Dark/Admin), pane order, no icon rail, share control (icon+text, single location), season dropdown/picker, search, MobileTabBar.
- [ ] Same comparison repeated against live production post-deploy.

## Testing

Unit: new `Masthead.test.tsx`; updates to `AppShell.test.tsx`, `App.test.tsx`, `EpisodeListView.test.tsx`, `EpisodeList.test.tsx`, `ShareDialog.test.tsx`, `AudioPlayerView.test.tsx`, `SeasonTabs.test.tsx`, `SeasonPicker.test.tsx`; deletion of `IconRail.test.tsx`. Full `make test`/`make lint`/typecheck must pass after every step.

E2E: `e2e/fixtures.ts`, `e2e/tests/admin.spec.ts`, `e2e/tests/screenshot.spec.ts`, `e2e/tests/theme.spec.ts` updated in Step 8. Full local `make e2e` plus CI's real run on the eventual `main`-targeting PR.

Manual: Step 9 is the actual acceptance test for this plan's premise and is not optional or satisfiable by green automated tests alone — that was already tried once (plan 005's quality gate passed in full and still missed the shell-level gap this plan exists to close).

## Notes

- Do not re-touch anything Step 0 (Context) confirms is already correct: design tokens, fonts, season nav architecture, cross-catalog search, `MobileTabBar`, `DetailPane`'s transport controls, `EpisodeItem`'s active-row styling. If a step's diff touches those, stop and reconsider — it's drifted out of scope.
- This plan's Steps 1-5 are functionally identical to plan 006's Steps 1-5, which were correctly implemented and passed CI's full e2e suite (including against the production image) before being reverted for reasons unrelated to their correctness. Re-implementing them from a clean `git revert` state is expected to be fast.
- Steps 6-7 are new — real bugs/gaps the previous plan 006 pass never looked for, caught only by this pass's independent frontend-engineer and UX-designer review of a faithfully-reproduced standalone mockup.
