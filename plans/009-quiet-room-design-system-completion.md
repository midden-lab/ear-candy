---
id: quiet-room-design-system-completion
title: "Quiet Room design-system completion — full token layer, letter-spacing, radius, shadow"
status: in-progress
priority: 1
created: 2026-09-06
steps_completed: 9
steps_total: 10
tags: [design-system, ux, frontend, visual-fidelity, tokens]
---

# Quiet Room Design System Completion

## Summary

Plans 007 and 008 fixed real, confirmed gaps (shell structure, then specific typography/spacing/chrome items) but both were still spot-checks against a handful of screenshots, not a systematic audit. The user correctly identified that the app still "contains design components from the original web app" — and a full, file-by-file audit of every listener-facing component against the mockup's actual CSS confirms exactly why: **the token layer plan 005 built is incomplete.** `--canvas`/`--surface`/`--ink-*`/`--accent` exist and are used correctly, but `--hair` (subtle dividers), `--wash` (subtle hover tint), `--ring`/`--ring-2`, `--ease` (custom transition curve), and the three theme-aware shadow tokens (`--art-shadow`/`--row-shadow`/`--dock-shadow`) were never added. Every place the real app needs one of these, it instead falls back to generic Tailwind `zinc-*` classes, default shadow utilities, and default border-radius — which is precisely what "looks like the original app" means: the *specific*, refined, low-contrast Quiet Room surface language was never actually applied past the four base neutral tokens.

On top of the missing tokens, the audit found two systemic, cross-cutting gaps that were never addressed by any prior plan: **letter-spacing** (the mockup applies deliberate negative tracking to nearly every heading/title and positive tracking + monospace to nearly every label/numeric element; the real app applies almost none of this) and **border-radius** (the mockup uses near-sharp 2px corners on rectangular surfaces, reserving large/full radii only for genuinely circular or pill-shaped elements; the real app uses Tailwind's default soft-rounded utilities — `rounded-md`/`rounded-lg`/`rounded-xl` — almost everywhere).

This plan closes all of it, systematically, file by file, using the exact instance list a dedicated audit already produced — not another round of spot-fixing.

## Context

**Confirmed already correct, do not re-touch:** `--canvas`/`--surface`/`--ink`/`--ink-2`/`--ink-3`/`--ink-4` tokens and their usage; Archivo/IBM Plex Mono font loading; the desktop/mobile season-nav architecture; cross-catalog search; `MobileTabBar`'s icon-free/always-enabled behavior; `DetailPane`'s two-column layout and conditional transport (plan 008); `ShareDialog`'s single-render-site + icon+text trigger (plan 007); focus traps on `SeasonTabs`/`SeasonPicker` (plan 007).

**The missing tokens** (none of these exist anywhere in `client/src/index.css` today — confirmed via direct grep, zero results):

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--hair` | `rgba(18,19,22,.075)` | `rgba(255,255,255,.09)` | Barely-visible divider lines (currently `border-zinc-200 dark:border-zinc-800` everywhere — much more visible) |
| `--wash` | `rgba(18,19,22,.035)` | `rgba(255,255,255,.045)` | Subtle hover/active tint (currently `hover:bg-zinc-100 dark:hover:bg-zinc-800` — a full opaque gray) |
| `--ring` | `rgba(18,19,22,.11)` | `rgba(255,255,255,.10)` | Subtle ring/outline accent |
| `--ring-2` | `rgba(18,19,22,.13)` | `rgba(255,255,255,.13)` | Slightly stronger ring variant |
| `--ease` | `cubic-bezier(.32,.72,.26,1)` | (same, not theme-dependent) | The mockup's one custom transition curve, applied to nearly every hover/transform transition |
| `--art-shadow` | `0 1px 2px rgba(18,19,22,.05), 0 18px 44px -22px rgba(18,19,22,.22)` | `0 1px 0 rgba(255,255,255,.045) inset, 0 18px 44px -22px rgba(0,0,0,.65)` | Cover art shadow |
| `--row-shadow` | `0 1px 2px rgba(18,19,22,.04), 0 10px 26px -18px rgba(18,19,22,.28)` | `0 1px 0 rgba(255,255,255,.035) inset, 0 10px 26px -18px rgba(0,0,0,.6)` | Active/elevated row, popovers |
| `--dock-shadow` | `0 -1px 0 rgba(18,19,22,.055), 0 -30px 60px -30px rgba(18,19,22,.16)` | `0 -1px 0 rgba(255,255,255,.06), 0 -30px 60px -30px rgba(0,0,0,.55)` | Player bar/dock (currently has no shadow at all — substituted with a plain top border) |
| `--scrub-track` | `rgba(18,19,22,.09)` | `rgba(255,255,255,.12)` | Progress/scrub bar track color |

**Two real bugs found in passing, unrelated to tokens, fix alongside:**
- `AppShell.tsx` line 52 (current line number in the plan-008-updated file — verify before editing): the entire app's root background is `bg-zinc-50 dark:bg-zinc-950` — hardcoded raw zinc, not `bg-canvas`, even though the `canvas` token exists and is wired into `tailwind.config.ts`. This is the single highest-impact stray-color instance in the whole app: every screen's base background is currently off-token.
- `ShareDialog.tsx` line 224: `text-zinc-500 dark:text-zinc-500` — identical shade in both themes, inconsistent with every other light/dark pair in the file, almost certainly a copy-paste bug.

**Full per-file instance list** (from the completed audit — file:line references are approximate to when the audit ran; confirm each against current file state before editing, since line numbers shift as earlier steps in this plan edit the same files):

- **Hair (divider) candidates (~17):** `Masthead.tsx`, `EpisodeListView.tsx` (search input), `SeasonTabs.tsx` (container), `AudioPlayerView.tsx` (×2 — mobile bar + desktop bar, both currently substituting a border for the missing dock shadow), `MobileTabBar.tsx`, `MobileSettingsView.tsx` (×2 — card border + row dividers), `ShareDialog.tsx` (×3 — desktop panel, mobile sheet, url-row), `AppShell.tsx` (sidebar), `PrivacyNotice.tsx`.
- **Wash (hover/active tint) candidates (~5):** `SeasonTabs.tsx` option hover, `EpisodeItem.tsx` inactive-row hover, `ShareDialog.tsx` social-button hover, `MobileSettingsView.tsx` Admin-row active state, `ThemeBadge.tsx` hover.
- **Radius-on-rectangle candidates (~17):** `SeasonTabs.tsx` (popover + option), `SeasonPicker.tsx` (option), `EpisodeItem.tsx` (row + thumb), `DetailPane.tsx` (cover art), `AudioPlayerView.tsx` (mini cover, mini progress track, desktop cover), `MobileTabBar.tsx` (active indicator — currently `rounded-full`, mockup wants near-sharp `1px`), `MobileSettingsView.tsx` (card), `ShareDialog.tsx` (×5 — desktop panel, mobile sheet, url-row, Copy button, trigger), `TransportControls.tsx` (×3, currently inert with no fill/border but still present).
- **Shadow candidates (~7, plus one fully missing):** `EpisodeItem.tsx` (active row), `DetailPane.tsx` (cover art), `AudioPlayerView.tsx` (dock — **currently has no shadow at all**), `SeasonTabs.tsx` (popover), `ShareDialog.tsx` (×2 — desktop panel, mobile sheet), `ThemeBadge.tsx`.
- **Missing negative letter-spacing on prominent text (~14):** worst single instance is `DetailPane.tsx`'s episode title (mockup: `-.038em`, real: none). Also: `Masthead.tsx` wordmark/tagline/theme-toggle text, `SeasonTabs.tsx`/`SeasonPicker.tsx` trigger text, `SeasonPicker.tsx` dialog title, `EpisodeItem.tsx` row title, `DetailPane.tsx` play-button word + description, `AudioPlayerView.tsx` now-playing title (×2), `ShareDialog.tsx` dialog title.
- **Missing font-mono + positive tracking on label/numeric content (~13):** worst instances are `AudioPlayerView.tsx`'s time display (no font-mono at all) and `PlaybackStatusLine.tsx` (no font-mono/uppercase/tracking at all). Also: `SeasonTabs.tsx`/`SeasonPicker.tsx` option counts, `EpisodeItem.tsx` episode number/season-tag/time/duration, `DetailPane.tsx` eyebrow label/publish-date/"About" label/time spans, `ShareDialog.tsx` share-URL text + "Share to" label, `TransportControls.tsx` speed button, `MobileTabBar.tsx` tab labels (positive tracking only, mockup doesn't mono this one).
- **Stray raw `zinc-*` classes not yet on ink/canvas/surface tokens (60+):** concentrated in `EpisodeItem.tsx`, `DetailPane.tsx`, `AudioPlayerView.tsx`, `ShareDialog.tsx`, `MobileSettingsView.tsx`, plus the `AppShell.tsx` root background bug above.

**Files involved:** `client/src/index.css`, `client/tailwind.config.ts`, and every listener-facing component in `client/src/components/` except `AudioPlayer.tsx`/`EpisodeList.tsx`/`EpisodeCoverArt.tsx`/`PillBadge.tsx`/`ProgressBar.tsx` (confirmed by the audit to have no instances in scope, or in `ProgressBar`'s case, no fixable instances without a structural rebuild — see Notes).

## Steps

### Step 1: Complete the token layer

**Files:** `client/src/index.css`, `client/tailwind.config.ts`
**Requires review:** false

Add all nine missing tokens from the Context table above to `index.css`'s `:root` and `.dark` blocks, exactly matching the mockup's values. Wire them into `tailwind.config.ts`: `hair`/`wash`/`ring`/`ring2` as new color entries (so `border-hair`, `bg-wash`, `ring-ring` etc. become usable utilities — check existing naming convention for `canvas`/`surface` and match it); `ease` as a `transitionTimingFunction` entry; `art`/`row`/`dock` as `boxShadow` entries.

**Acceptance criteria:**
- [ ] All nine tokens present in both `:root` and `.dark` in `index.css`, values matching the table exactly.
- [ ] Corresponding Tailwind utilities usable (verify with one throwaway `className="border-hair"` compile check before moving to Step 2, then remove it).

---

### Step 2: Fix the two standalone bugs

**Files:** `client/src/components/AppShell.tsx`, `client/src/components/ShareDialog.tsx`
**Requires review:** false

`AppShell.tsx`: change the root `bg-zinc-50 dark:bg-zinc-950` to `bg-canvas` (single token, no dark: variant needed since the token itself already flips). `ShareDialog.tsx` line ~224: fix `text-zinc-500 dark:text-zinc-500` to a real light/dark pair (check the surrounding label pattern in the same file for the correct pair, likely `text-zinc-500 dark:text-zinc-400` or the `ink-3` token per Step 8).

**Acceptance criteria:**
- [ ] App's root background responds correctly to theme toggle via the token, not a hardcoded class (verify visually — should be indistinguishable from before, since `--canvas` and the old zinc values are close, but now token-driven).
- [ ] `ShareDialog`'s "Share to" label (or whichever element line 224 is) visibly differs between light and dark mode.

---

### Step 3: Apply `--hair` to all divider borders

**Files:** `Masthead.tsx`, `EpisodeListView.tsx`, `SeasonTabs.tsx`, `AudioPlayerView.tsx`, `MobileTabBar.tsx`, `MobileSettingsView.tsx`, `ShareDialog.tsx`, `AppShell.tsx`, `PrivacyNotice.tsx`
**Requires review:** false

Replace every `border-zinc-200 dark:border-zinc-800`-style divider (per the Context list's ~17 instances) with `border-hair` (single class, no dark: pair needed). For `AudioPlayerView.tsx`'s two instances specifically: these borders exist as a substitute for the dock shadow that was never added — after Step 6 adds real `shadow-dock`, evaluate whether the border should be removed entirely (matching the mockup, which uses shadow-only, no border) or kept alongside the hairline. Recommend removing it, matching the mockup exactly.

**Acceptance criteria:**
- [ ] All ~17 listed instances converted.
- [ ] Dividers visibly more subtle in both themes compared to before.

---

### Step 4: Apply `--wash` to all subtle hover/active states

**Files:** `SeasonTabs.tsx`, `EpisodeItem.tsx`, `ShareDialog.tsx`, `MobileSettingsView.tsx`, `ThemeBadge.tsx`
**Requires review:** false

Replace `hover:bg-zinc-100 dark:hover:bg-zinc-800` (and `active:bg-zinc-100 dark:active:bg-zinc-800` where used for tap feedback) with `hover:bg-wash`/`active:bg-wash` per the Context list's ~5 instances.

**Acceptance criteria:**
- [ ] All ~5 listed instances converted; hover states read as a subtle tint, not a solid gray fill.

---

### Step 5: Fix border-radius on rectangular elements

**Files:** `SeasonTabs.tsx`, `SeasonPicker.tsx`, `EpisodeItem.tsx`, `DetailPane.tsx`, `AudioPlayerView.tsx`, `MobileTabBar.tsx`, `MobileSettingsView.tsx`, `ShareDialog.tsx`, `TransportControls.tsx`
**Requires review:** false

Per the Context list's ~17 instances: replace `rounded-md`/`rounded-lg`/`rounded-xl`/`rounded-2xl`/`rounded-t-2xl` on rectangular surfaces with `rounded-sm` (Tailwind's smallest non-zero radius, ~2px) or `rounded-none` where the mockup uses no radius at all (verify per-element against the mockup's exact CSS — most surfaces use 2px, but a few, like `.season-popover`, use none). Leave every genuinely circular/pill element unchanged (play buttons, `PillBadge`, `ThemeBadge`, close buttons, social-share buttons, the mobile phone-frame-style sheet corners which are large by design). `MobileTabBar.tsx`'s active-tab indicator is the one instance going the *other* direction — from `rounded-full` to near-sharp `rounded-sm`/`1px`.

**Acceptance criteria:**
- [ ] All ~17 listed rectangular instances converted to sharp/near-sharp corners.
- [ ] No circular/pill element altered.
- [ ] Side-by-side against the mockup, corners read as "crisp," not "soft."

---

### Step 6: Apply theme-aware shadow tokens

**Files:** `EpisodeItem.tsx`, `DetailPane.tsx`, `AudioPlayerView.tsx`, `SeasonTabs.tsx`, `ShareDialog.tsx`, `ThemeBadge.tsx`
**Requires review:** false

Replace generic `shadow-sm`/`shadow-lg`/`shadow-xl` with `shadow-row`/`shadow-art`/`shadow-dock` (from Step 1's Tailwind config) per the Context list's ~7 instances, matching which token fits which element (row/popover surfaces → `shadow-row`; cover art → `shadow-art`; the player bar/dock → `shadow-dock`, newly added since it had none before). `ShareDialog`'s two modal surfaces don't have a dedicated mockup token — use `shadow-row` as the closest existing match rather than inventing a new one for two call sites.

**Acceptance criteria:**
- [ ] All ~7 listed instances converted, plus the dock's previously-absent shadow now present.
- [ ] Shadows read as soft/diffuse/ambient, matching the mockup, not Tailwind's sharper default presets.

---

### Step 7: Apply letter-spacing conventions

**Files:** `Masthead.tsx`, `SeasonTabs.tsx`, `SeasonPicker.tsx`, `EpisodeItem.tsx`, `DetailPane.tsx`, `AudioPlayerView.tsx`, `ShareDialog.tsx`, `PlaybackStatusLine.tsx`, `TransportControls.tsx`, `MobileTabBar.tsx`
**Requires review:** false

Two sub-patterns, applied per the Context list's ~14 + ~13 instances:
1. **Negative tracking on headings/titles/prominent text** — use Tailwind's `tracking-tight` (-0.025em) as a reasonable stand-in where the mockup's exact value is close (most are between -.01em and -.02em), and an arbitrary value (`tracking-[-0.038em]`) specifically for `DetailPane.tsx`'s episode title, where the gap is largest and most visible.
2. **`font-mono` + positive tracking on label/numeric/mono content** — add `font-mono tracking-wide` (or an arbitrary value matching the specific mockup element, e.g. `tracking-[.06em]` for speed/count displays) to every instance listed, especially `AudioPlayerView.tsx`'s time display and `PlaybackStatusLine.tsx` (both currently have zero mono treatment).

**Acceptance criteria:**
- [ ] All ~27 listed instances updated.
- [ ] Episode title and other headings visibly tighter; numeric/label content visibly monospaced with wider tracking.

---

### Step 8: Replace remaining stray `zinc-*` classes with ink tokens

**Files:** `EpisodeListView.tsx`, `EpisodeItem.tsx`, `DetailPane.tsx`, `AudioPlayerView.tsx`, `ShareDialog.tsx`, `MobileSettingsView.tsx`, `MobileTabBar.tsx`, `ThemeBadge.tsx`, `PlaybackStatusLine.tsx`
**Requires review:** false

Per the Context list's 60+ instances: map `text-zinc-900 dark:text-zinc-100` → `text-ink`; `text-zinc-600 dark:text-zinc-300` → `text-ink-2`; `text-zinc-500 dark:text-zinc-400` (and the `dark:text-zinc-500` bug from Step 2) → `text-ink-3`; `text-zinc-400 dark:text-zinc-500` → `text-ink-3` or `text-ink-4` (check visual weight intent per instance — CLAUDE.md's token table maps `--ink-3`/`--ink-4` to specific zinc shades, use that mapping rather than guessing); background/ring instances (`bg-zinc-100`/`ring-zinc-200` etc. used as placeholder fills, not dividers or hovers already covered in Steps 3-4) → `bg-surface`/`ring-hair` as appropriate. This is the largest step by instance count but the most mechanical — a careful find-and-replace per file, not a design decision.

**Acceptance criteria:**
- [ ] `grep -rn "text-zinc-\|bg-zinc-\|ring-zinc-\|border-zinc-" client/src/components/` (excluding admin pages and any genuinely-intentional exceptions like `PillBadge`'s caller-supplied blue/purple guest/tag colors) returns nothing.

---

### Step 9: Full quality gate + fix any test breakage from Steps 1-8

**Files:** all test files corresponding to every component touched above
**Requires review:** false

Run `make test`/`make lint`/typecheck after every prior step (per this repo's non-negotiable quality-gate convention, not deferred to the end) — this step exists to catch anything a step-by-step run missed and do a final full-suite pass. Expect test breakage primarily from class-name assertions (tests checking for `rounded-lg` or `shadow-sm` literally) rather than behavioral changes — update assertions to match, don't weaken them.

**Acceptance criteria:**
- [ ] Full `make test` (server + client) green.
- [ ] `make lint` clean on both packages.
- [ ] `tsc --noEmit` clean.

---

### Step 10: Verification against the real mockups

**Files:** none
**Requires review:** true (ship/no-ship gate)

Same process as plans 007/008's final steps, but with more riding on it given the scope: run the dev stack, open the real app and `plans/007-mockups/desktop.html`/`mobile.html` side by side at matching viewports with the same episode selected, and get the user's explicit sign-off before considering this done. Check every category from this plan's Context section specifically — dividers, hover states, corner sharpness, shadow softness, letter-spacing/tracking, mono usage — not just the general impression.

**Acceptance criteria:**
- [ ] Side-by-side comparison explicitly covers every category in this plan's Context section.
- [ ] User has explicitly confirmed the result.

## Testing

Unit tests for every touched component need their class-name assertions (not their behavioral assertions) updated to match new token classes — expect this to be the majority of test changes across Steps 1-8, not new test logic. Full `make test`/`make lint`/typecheck must stay green after every step per this repo's established convention.

No new e2e coverage anticipated — same reasoning as plan 008 (this is visual presentation, not new interaction behavior).

## Notes

- `ProgressBar.tsx` is flagged in the audit as a structural gap, not a token-substitution one: it's a bare native `<input type="range">`, while the mockup's scrub bar is a fully custom track+fill+knob div structure using `--scrub-track`. Rebuilding it as a custom control is out of scope for this plan (which is about applying existing/newly-added tokens, not building new custom widgets) — flag as a candidate for a future, narrower plan if the native range input's appearance (post `accent-[var(--accent)]` styling) still reads as visually generic after this plan's other fixes land.
- `PillBadge.tsx`'s hardcoded `blue-*`/`purple-*` guest/tag colors (used by `DetailPane.tsx`) are outside this plan's token scope (they're not zinc/neutral-scale colors at all) — noted by the audit as worth a future look, not actioned here, since the mockup's own demo data doesn't exercise guest/tag pills in a way that established a settled color convention for them.
- This plan is intentionally organized by *fix category* (all hair-token conversions together, all radius fixes together, etc.) rather than by file, since most individual fixes are mechanical repetitions of the same pattern — this should make each step fast to execute correctly and easy to verify as a batch, rather than context-switching between fix-types file by file.
- The root cause this plan exists to address, stated plainly: two prior plans (007, 008) each fixed real, confirmed issues but were each grounded in spot-checks (a handful of screenshots, a handful of files) rather than a systematic token-and-convention audit across the entire component tree. This plan's Context section is the first artifact in this whole effort that actually enumerates every instance rather than a representative sample — treat that completeness as the standard for any future design-system work on this codebase, not the exception.
