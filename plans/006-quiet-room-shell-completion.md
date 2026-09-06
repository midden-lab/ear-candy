---
id: quiet-room-shell-completion
title: "Quiet Room shell completion — masthead, pane order, IconRail retirement"
status: in-progress
priority: 1
created: 2026-09-05
steps_completed: 7
steps_total: 8
tags: [design-system, ux, frontend, redesign, shell]
---

# Quiet Room Shell Completion

## Summary

Plan 005 implemented every listener-facing *component* plans/004 scoped (season nav, MobileTabBar, DetailPane transport, tokens/fonts, active-row styling) and shipped it to production. A post-ship visual audit against the actual reference mockup (https://claude.ai/code/artifact/45ce2080-cfd2-4bcc-91c0-5475ec994055, cited in plans/004's "Reference mockup" section) found that plans/004 never addressed the desktop **page shell** itself: the mockup's masthead, pane order, and total absence of an icon sidebar were never carried into either plans/004 or plans/005, so the real app still runs its pre-Quiet-Room shell (`IconRail.tsx`, list-left/detail-right, a floating theme badge) underneath the correctly-rebuilt components. This plan closes that specific gap — the shell only, not a re-litigation of anything plan 005 already did correctly.

## Context

**What's already correct (do not touch):** `SeasonTabs.tsx`, `SeasonPicker.tsx`, `MobileTabBar.tsx`, `DetailPane.tsx`'s transport/share/content layout, `EpisodeItem.tsx`'s active-row styling, the `--canvas`/`--surface`/`--ink-*` token layer, Archivo/IBM Plex Mono fonts. These were verified against the mockup directly (both by reading the mockup's own saved HTML and by screenshot comparison) and match.

**What's wrong, confirmed by reading the mockup's actual DOM** (saved locally; see `<aside class="index">`/`<main class="stage">` order and `<header class="masthead">` around line 452-469 of the fetched artifact HTML) **and cross-checked against `/Users/m8ttyb/Desktop/mockups/mockup-desktop.png` / `mockup-mobile.png`:**

1. **No masthead exists in the real app.** The mockup has a full-width header spanning the whole shell: wordmark + tagline on the left, and on the right a `Light / Dark` text toggle plus a plain-text `Admin` link (`<a class="admin-link">Admin</a>` — not an icon). The real app instead renders the podcast name as a small `<h2>` buried inside `EpisodeListView.tsx` (only visible when the Episodes pane is showing), a `ThemeBadge` floating fixed-position emoji button (`AppShell.tsx` line ~81-85), and `IconRail.tsx`'s gear icon for Admin.
2. **`IconRail.tsx` has no mockup equivalent at all.** It should be deleted, not restyled — its two real responsibilities (Admin access, theme toggle) move into the new masthead.
3. **Desktop pane order is reversed.** The mockup's `.floor` puts `<main class="stage">` (the detail view: cover art, title, About) first/left, and `<aside class="index">` (search + season selector + episode list) second/right. `AppShell.tsx` currently renders `sidebar` (episode list) in the left `<aside>` and `detail` in the `<main>` on the right — backwards relative to the settled design.
4. **`settings.tagline`** (`client/src/types.ts`/`server/src/types.ts`, already exists on `Settings`, already fetched by `App.tsx`'s boot effect) **is fetched but never rendered anywhere in the client.** The masthead is what's supposed to show it.
5. Confirmed **not** a gap, no action needed: the mockup's concentric-ring cover art (`<div class="rings">`) is documented in plans/004 as placeholder-only styling for episodes with no real uploaded art — real episodes already show their real uploaded cover art via `EpisodeCoverArt.tsx`, which is correct as-is.
6. Confirmed **not** a gap: mobile's list pane (search, season picker dialog, episode list) already matches `mockup-mobile.png` pixel-for-pixel per direct comparison. Mobile's gap is narrower — see Step 1.

**Files involved:** `client/src/components/AppShell.tsx`, `client/src/components/IconRail.tsx` (deleted), `client/src/components/ThemeBadge.tsx` (kept, reused by mobile Settings only), `client/src/components/EpisodeListView.tsx`, `client/src/components/MobileSettingsView.tsx` (unchanged, confirmed already correct), `client/src/App.tsx`, `client/src/types.ts`/`server/src/types.ts` (read-only, `tagline` already exists), plus new `client/src/components/Masthead.tsx`.

**Dependency:** none of plan 005's work is touched or re-opened. This plan can start immediately.

## Steps

### Step 1: Build `Masthead.tsx`

**Files:** `client/src/components/Masthead.tsx` (new), `client/src/tests/Masthead.test.tsx` (new)
**Requires review:** false

Create a new component:

```ts
interface MasthedProps {
  podcastName: string
  tagline: string
  /** Renders the right-hand Light/Dark toggle + Admin link. False on mobile,
   *  where those controls live in the Settings tab instead (MobileSettingsView
   *  already does this correctly — untouched by this plan). */
  showControls?: boolean
  isDark?: boolean
  onToggleTheme?: () => void
  onAdminClick?: () => void
}
export default function Masthead({ podcastName, tagline, showControls = false, isDark, onToggleTheme, onAdminClick }: MasthedProps)
```

Markup: a flex row, wordmark (`podcastName`, bold, `font-sans`) + `tagline` (smaller, `text-ink-3`) stacked in a left block. When `showControls` is true, render a right-hand block with two adjacent text buttons `Light` / `Dark` (the currently-inactive one dimmed, the active one full-`ink` weight/color, `aria-pressed` on each, calling `onToggleTheme` — mirror the mockup's `.themeswitch` pattern: two buttons, not a single toggle switch) and a plain-text link/button `Admin` (`onClick={onAdminClick}`, no icon, matching the mockup's `<a class="admin-link">Admin</a>`). When `showControls` is false, render only the wordmark/tagline block (this is the mobile persistent-header variant).

Use existing tokens (`text-ink`, `text-ink-3`, `border-zinc-200 dark:border-zinc-800` for the bottom border) — no new CSS variables needed.

Do not touch `ThemeBadge.tsx` — it stays exactly as-is, still used by `MobileSettingsView.tsx`'s "Appearance" row (confirmed correct, out of scope).

**Acceptance criteria:**
- [ ] `Masthead` renders `podcastName` and `tagline` unconditionally.
- [ ] `showControls=false` (or omitted) renders no theme toggle and no Admin link.
- [ ] `showControls=true` renders `Light`/`Dark` buttons with `aria-pressed` reflecting `isDark`, and clicking either calls `onToggleTheme`.
- [ ] `showControls=true` renders an `Admin` button/link; clicking it calls `onAdminClick`.
- [ ] New test file covers all four criteria above.

---

### Step 2: Restructure `AppShell.tsx` — masthead, pane order, remove `rail`

**Files:** `client/src/components/AppShell.tsx`
**Requires review:** true (structural layout change affecting every listener-facing screen)

Replace the `rail` prop with a `masthead: ReactNode` prop, rendered once at the very top of the root `<div>`, above everything else, on **both** desktop and mobile (the mobile variant is the `showControls=false` `Masthead` from Step 1 — App.tsx decides which variant to pass down via `isDesktop`, or `AppShell` can accept two variants; simplest is for `App.tsx` to pass one `masthead` node already built with the correct `showControls` value, since `App.tsx` already computes `isDesktop`-equivalent state nowhere today — instead, have `AppShell` itself pass its own `isDesktop` down by accepting `masthead: (isDesktop: boolean) => ReactNode` OR, simpler and consistent with how `detail`/`sidebar` already work as plain nodes: keep `masthead` as a plain `ReactNode` prop and have `App.tsx` render two different `<Masthead>` elements gated on a `useBreakpoint` call in `App.tsx` itself. Pick the latter — `AppShell` should stay breakpoint-agnostic for `masthead` exactly like its other props).

Remove the `rail` prop entirely and its call site inside the `isDesktop && (<aside>...)` block.

Reorder the desktop two-column area so `detail` renders first (left, `<main>`, `flex-1`) and `sidebar` renders second (right, fixed `w-64`, now `border-l` instead of `border-r`):

```tsx
<div className="flex flex-1 overflow-hidden">
  <main ref={mainRef} tabIndex={-1} className="flex-1 overflow-y-auto" style={{...same padding-bottom as today...}}>
    {detail}
  </main>
  {isDesktop && (
    <aside className="w-64 flex-shrink-0 overflow-y-auto border-l border-zinc-200 dark:border-zinc-800">
      {sidebar}
    </aside>
  )}
</div>
```

Mobile behavior is unchanged apart from sitting below the new masthead: `focusedPane === 'list' ? sidebar : ...` still applies inside the same single `<main>` swap — only wrap the whole existing return value's contents one level deeper, under the new masthead row.

Remove the `themeBadge && isDesktop` floating-fixed-corner block entirely (lines ~81-85) — the desktop theme toggle now lives in the masthead, not as a floating badge. Keep the `themeBadge` prop itself removed from `AppShellProps` too, since nothing in `AppShell` needs it anymore (mobile's Settings-tab theme toggle is wired directly in `App.tsx` → `MobileSettingsView`, bypassing `AppShell` already).

**Acceptance criteria:**
- [ ] `AppShellProps` no longer has `rail` or `themeBadge`; has a new `masthead: ReactNode`.
- [ ] Desktop: masthead renders full-width above a two-column row; `detail` is the left/main column; `sidebar` is the right/`w-64` column with a left border.
- [ ] No floating fixed-position theme badge renders anywhere in `AppShell`'s own output.
- [ ] Mobile: masthead renders above the single swappable `<main>` pane; existing list/detail/settings swap behavior is unchanged.
- [ ] `client/src/tests/AppShell.test.tsx` (if it exists — check first) updated for the new prop shape and pane order; if it doesn't exist, this is covered by Step 6's `App.test.tsx` updates instead.

---

### Step 3: Wire `Masthead` into `App.tsx`; delete `IconRail` usage

**Files:** `client/src/App.tsx`
**Requires review:** false

- Remove the `import IconRail from './components/IconRail'` line and its `rail={<IconRail .../>}` usage.
- Add `const isDesktopShell = useBreakpoint(MD_BREAKPOINT_QUERY)` (import from `./hooks/useBreakpoint`, same hook already used elsewhere) and build:
  ```tsx
  const masthead = (
    <Masthead
      podcastName={settings.podcast_name}
      tagline={settings.tagline}
      showControls={isDesktopShell}
      isDark={isDark}
      onToggleTheme={toggleDark}
      onAdminClick={() => void handleAdminClick()}
    />
  )
  ```
- Pass `masthead={masthead}` to `<AppShell>`; remove the now-nonexistent `rail`/`themeBadge` props from that call site (keep the separate `const themeBadge = <ThemeBadge .../>` line and its existing use inside the `settings={<MobileSettingsView themeBadge={themeBadge} .../>}` prop — that path is unrelated and stays exactly as-is).

**Acceptance criteria:**
- [ ] No reference to `IconRail` remains in `App.tsx`.
- [ ] `Masthead` is rendered with real `settings.podcast_name`/`settings.tagline` and the real theme/admin handlers.
- [ ] Mobile Settings tab's theme toggle (via `MobileSettingsView`) still works unchanged — verify by reading, not just inference, since this is the one place `ThemeBadge` remains legitimately in use.

---

### Step 4: Remove the duplicate podcast-name header from `EpisodeListView.tsx`

**Files:** `client/src/components/EpisodeListView.tsx`, `client/src/components/EpisodeList.tsx`, `client/src/tests/EpisodeListView.test.tsx`, `client/src/tests/EpisodeList.test.tsx`
**Requires review:** false

Delete both `<h2>{podcastName}</h2>` blocks (the `isDesktop ? ... : ...` pair at the top of `EpisodeListView`'s returned JSX) — the masthead now owns this, rendered once, persistently, above the pane regardless of which mobile tab is active (previously this heading only appeared while the Episodes pane was showing; that gap is fixed as a side effect of this plan, not an explicit goal, so don't design around it further). Remove the now-unused `podcastName` prop from `EpisodeListViewProps` and `EpisodeListProps` (check `EpisodeList.tsx` for whether it merely forwards the prop or does something else with it first), and its callers.

**Acceptance criteria:**
- [ ] Neither `EpisodeListView` nor `EpisodeList` renders a podcast-name heading.
- [ ] `podcastName` prop removed from both components' interfaces and all call sites (`App.tsx`'s `<EpisodeList podcastName={...} .../>` prop removed).
- [ ] Existing tests asserting the old heading text are updated to assert its absence (or removed if redundant with a Masthead test now covering that assertion).

---

### Step 5: Delete `IconRail.tsx`

**Files:** `client/src/components/IconRail.tsx` (deleted), `client/src/tests/IconRail.test.tsx` (deleted)
**Requires review:** false

Delete both files outright. Confirm via grep (`grep -rn IconRail client/src`) that no import remains anywhere (Step 3 already removed `App.tsx`'s usage — this step is just the file deletion once nothing references it).

**Acceptance criteria:**
- [ ] `IconRail.tsx` and its test file no longer exist.
- [ ] `grep -rn IconRail client/src` returns no results.

---

### Step 6: Update client unit tests for the new Admin entry point and shell shape

**Files:** `client/src/tests/App.test.tsx`, any test referencing `'Admin settings'` (the old IconRail gear button's `aria-label`)
**Requires review:** false

Grep `client/src/tests/` for `'Admin settings'` and `IconRail`. Update each to reach Admin via the new masthead's `Admin` text control instead (exact accessible name from Step 1's implementation — likely `getByRole('button', { name: 'Admin' })` or `getByRole('link', { name: 'Admin' })` depending on whether Step 1 used a `<button>` or `<a>`; use a `<button onClick>` for consistency with the rest of the app's client-side-routed navigation, not a real `<a href>`, so tests should query it as a button). Add/update assertions that `Masthead` receives real `settings.podcast_name`/`settings.tagline` from `App.tsx`'s rendered output.

**Acceptance criteria:**
- [ ] No test references `'Admin settings'` or `IconRail` anymore.
- [ ] `make test` (client) passes in full.

---

### Step 7: Update e2e tests for the new Admin entry point

**Files:** `e2e/fixtures.ts`, `e2e/tests/admin.spec.ts`, `e2e/tests/mobile.spec.ts`, `e2e/tests/screenshot.spec.ts`
**Requires review:** false

`e2e/fixtures.ts` line ~89 (`adminPage` fixture) clicks `page.getByRole('button', { name: 'Admin settings' })` to reach the admin panel from desktop — update to the new masthead `Admin` control's accessible name from Step 1/6. Grep the three spec files above for the same string and for any lingering assumption about `IconRail`'s presence (e.g. a "rail" width assertion, if any — check before assuming none exist). Leave `'Admin dashboard'` references alone (`mobile.spec.ts`, `MobileSettingsView`'s row) — that's the mobile Settings-tab path, unaffected by this plan.

Run `make e2e-reset-db` then a full `make e2e` locally per CLAUDE.md's standard e2e workflow (not `cd e2e && npm test` directly) before considering this step done.

**Acceptance criteria:**
- [ ] `adminPage` fixture reaches the admin panel via the new masthead control.
- [ ] Full local `make e2e` run passes (25 pre-existing unrelated `admin.spec.ts`-cleanup-cascade failures per CLAUDE.md gotcha #28/#30 are expected and out of scope, matching the precedent set in plan 005's own execution — cross-check the specific failing test names against that precedent rather than assuming all failures are pre-existing).

---

### Step 8: Verify production against the real mockups

**Files:** none (verification only)
**Requires review:** false

After this plan ships through the repo's normal branch → PR → dev → PR → main → deploy flow (same process as plan 005), capture fresh screenshots of the live production URL at both desktop (1280×900) and mobile (390×844) viewports (reuse the Playwright approach from this session's `e2e/inspect-prod.mjs` pattern — navigate, screenshot, no auth/cookies needed for the public listener UI), with at least one episode selected so the populated detail view is visible (not the empty "select an episode" placeholder).

Place the two new screenshots side-by-side against `/Users/m8ttyb/Desktop/mockups/mockup-desktop.png` and `mockup-mobile.png` and confirm, element by element: masthead present with wordmark/tagline/Light-Dark-toggle/Admin link; detail view on the left/main; episode index as the right sidebar; no icon rail anywhere; season dropdown; icon-free mobile tab bar; Share control position. Report any remaining mismatch explicitly rather than declaring success from the component-level tests alone — this step exists specifically because plan 005's per-step quality gate (unit tests + lint + typecheck) already passed in full without catching the shell-level gap this plan fixes, so passing tests again is not sufficient evidence on its own this time.

**Acceptance criteria:**
- [ ] Fresh production screenshots captured post-deploy, not reused from before this plan's changes.
- [ ] Explicit side-by-side comparison against both mockup files, covering every element listed above.
- [ ] Any remaining discrepancy is reported by name, not glossed over.

## Testing

Unit tests: new `Masthead.test.tsx` (Step 1); updates to `App.test.tsx`, `EpisodeListView.test.tsx`, `EpisodeList.test.tsx` (Steps 4, 6); deletion of `IconRail.test.tsx` (Step 5). Full `make test`/`make lint`/`make typecheck` must pass after every step, same non-negotiable quality gate as plan 005 — do not defer test fixes to a later step.

E2E: `e2e/fixtures.ts` and three spec files updated in Step 7; full `make e2e` run required before considering the plan done, in addition to CI's own e2e job on the eventual `main`-targeting PR.

Manual/visual: Step 8 is the actual acceptance test for this plan's entire premise (the shell now matches the settled design) and must not be skipped or treated as optional, since this plan exists precisely because that check was skipped after plan 005.

## Notes

- This plan deliberately does not touch anything plan 005 already implemented correctly. If a step's diff would touch `SeasonTabs.tsx`, `SeasonPicker.tsx`, `MobileTabBar.tsx`, `DetailPane.tsx`, or the token/font layer, that's a signal the step has drifted out of scope — stop and reconsider.
- The root cause this plan exists to fix was a plan-architect gap, not an execution gap: plans/004 (the design reference) never mentioned `IconRail.tsx`, the masthead, or pane order at all, despite the mockup it cites containing all three. Future design-system reference docs should explicitly audit the *whole rendered page*, including chrome the mockup doesn't call out as a "component" (headers, sidebars, nav rails), not just the component-mapping table.
- `Masthead`'s `Admin` control is a `<button>`, not a real `<a href>`, consistent with the rest of this app's client-side, router-free view switching (`App.tsx`'s `view` state) — the mockup's `<a class="admin-link" href="#">` is mockup-only markup convention, not a pattern to copy literally.
