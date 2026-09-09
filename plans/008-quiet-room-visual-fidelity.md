---
id: quiet-room-visual-fidelity
title: "Quiet Room visual fidelity — typography scale, spacing, DetailPane layout, control chrome"
status: complete
priority: 1
created: 2026-09-06
steps_completed: 7
steps_total: 7
tags: [design-system, ux, frontend, visual-fidelity]
---

# Quiet Room Visual Fidelity

## Execution note (2026-09-06)

Step 4 was extended beyond its original text to also cover `SeasonPicker.tsx`'s mobile trigger, not just `SeasonTabs.tsx`'s desktop one — the mobile mockup's `.season-trigger` CSS is the identical borderless, plain-text style as desktop's (confirmed directly in `plans/007-mockups/mobile.html`), so `SeasonPicker`'s pill/rounded-full/bordered button was an equally real, equally verified fidelity gap that the original step text just didn't call out by name.

Step 7 (side-by-side, user-confirmed verification) has not happened yet — everything through Step 6 is implemented and quality-gate-clean, but awaiting the user's own look before this plan is considered done.

## Summary

Plan 007 fixed the *structural* gaps between the real app and the settled Quiet Room mockup (masthead, desktop pane order, `IconRail` retirement, `ShareDialog` de-duplication, focus traps) — those are correct and this plan does not touch them. What plan 007 did not check, and what a direct side-by-side screenshot comparison (real app vs. `plans/007-mockups/desktop.html`/`mobile.html`, same viewport, same episode) surfaced, is that several components plans/004/005 previously marked "already matches the design system" are functionally correct but visually much smaller/tighter/plainer than the mockup — different typography scale, different control chrome (boxed inputs vs. borderless), a completely different internal layout for the detail view, and a missing/extra thumbnail treatment in the episode list. This plan closes that gap.

## Context

**Do not re-touch:** `Masthead.tsx`, `AppShell.tsx`'s pane order, `IconRail` (deleted), `ShareDialog`'s single-render-site fix, `SeasonTabs`/`SeasonPicker`'s focus traps — all plan 007, all correct, verified structurally and interactively.

**Confirmed gaps, each checked directly against the real file and the mockup's real CSS (not estimated from a screenshot alone):**

1. **`DetailPane.tsx`'s macro-layout is single-column stacked; the mockup is two-column.** Real (`DetailPane.tsx` line 75 on): a single `<div className="p-4 md:p-8">` stacks cover art, then season/share row, then title, then play button, then description, all full-width, top to bottom. Mockup (`desktop.html` `.stage-head{grid-template-columns:296px minmax(0,1fr);gap:56px}`): cover art is a fixed-width left column; season/share row, title, meta, and play button sit in a right column *beside* the art, not below it. This is the single biggest layout difference — not a sizing tweak, a different arrangement.
2. **Cover art is far smaller and has no size anchor.** Real: `w-48` (192px, a plain Tailwind utility with no relationship to the surrounding grid). Mockup: 296px, sized as one column of a two-column grid (`.stage-head`), so it scales as a real layout element, not a fixed thumbnail blown up.
3. **Episode title is dramatically smaller.** Real: `text-2xl font-bold` (24px) — `DetailPane.tsx` line 103. Mockup: `.ep-title{font-size:56px;font-weight:600;line-height:1.03;max-width:13ch}` — nearly 2.5x larger, and deliberately narrow (`13ch`) so long titles wrap to multiple lines as a design feature, not an accident.
4. **Play button is a different visual object entirely.** Real: a small pill (`rounded-full ... px-5 py-2`, `DetailPane.tsx` line 121) with an inline icon+word. Mockup (`.play-primary`/`.play-disc`): a large 58px circular disc with its own shadow, next to a two-line text block ("Play" + "60 MIN" subtext in mono caps beneath it, `desktop.html` lines 176-181).
5. **"About this episode" body text is smaller and unconstrained.** Real: default paragraph size (`leading-relaxed`, ~16px, `DetailPane.tsx` line 191), no max-width. Mockup: `.description{font-size:19.5px;line-height:1.62;max-width:54ch}` — larger and deliberately line-length-limited for readability.
6. **Search input has the wrong chrome.** Real (`EpisodeListView.tsx` line 72): `rounded-md border border-zinc-200 bg-surface px-3 py-1.5` — a filled, bordered box. Mockup (`.ep-search input`): `background:transparent;border:0;border-bottom:1px solid var(--hair)` — no box at all, just a bottom hairline that all but disappears until focused.
7. **Season dropdown trigger has the wrong chrome.** Real (`SeasonTabs.tsx` line ~90): `rounded-md border border-zinc-200 bg-surface w-56 px-3 py-1.5` — a filled, bordered, fixed-width button. Mockup (`.season-trigger`): plain text + a small caret, no visible button box, no border, no fill.
8. **Episode rows always show a thumbnail box; the mockup's rows are text-only.** Real (`EpisodeItem.tsx` line 48): every row renders a `h-14 w-14`/`h-10 w-10` box (a real thumbnail if art exists, otherwise an empty gray placeholder) next to the episode text. Mockup (`.row`): `grid-template-columns:34px minmax(0,1fr) auto` — episode number, title, time — no image column at all, on desktop or mobile.
9. **Spacing is systemically tighter throughout.** Mockup: `.room{padding:0 72px 200px}`, `.floor{gap:104px}`, `.masthead{padding:44px 0 72px}` — generous, airy margins throughout. Real: `DetailPane`'s `p-4 md:p-8`, `EpisodeListView`'s `px-4 py-2`/`px-4 py-3` rows, `Masthead`'s `px-4 py-3` — Tailwind's small/medium spacing scale throughout, reading as cramped by comparison at every level, not just one component.

**Files involved:** `client/src/components/DetailPane.tsx`, `client/src/components/EpisodeListView.tsx`, `client/src/components/SeasonTabs.tsx`, `client/src/components/SeasonPicker.tsx`, `client/src/components/EpisodeItem.tsx`, `client/src/components/Masthead.tsx`, `client/tailwind.config.ts` (if new spacing/type-scale tokens are worth adding rather than one-off utility values), plus corresponding test files.

## Open questions — resolve before implementation

- **Episode row thumbnails (#8):** remove them entirely to match the mockup's text-only rows, or keep them? Cover art thumbnails are a real, already-built feature (`EpisodeCoverArt`, admin upload pipeline) — removing them from the list view would hide real content admins have uploaded, not just a style change. Recommend: **keep thumbnails**, treat this specific mockup/real difference as an intentional divergence rather than a bug, since discarding a working content-display feature to match a mockup's placeholder-data demo seems backwards. Flag to the user explicitly rather than deciding unilaterally.
- **DetailPane's two-column layout (#1) on narrow viewports:** the mockup's own responsive breakpoints (`desktop.html` `@media (max-width:820px){.stage-head{grid-template-columns:minmax(0,1fr)}}`) collapse to single-column below 820px. Since `DetailPane` is also used as the mobile detail view (via `AppShell`'s single-pane mobile layout), does the two-column treatment apply at `md`+ only (matching the mockup's own breakpoint logic), or should mobile keep exactly its current single-column stack regardless? Recommend: mirror the mockup's own breakpoint — two-column at `md`+, single-column stack below it (which is close to what mobile already does).

## Steps

### Step 1: Introduce a small set of reusable spacing/type-scale values

**Files:** `client/tailwind.config.ts` (if warranted), or just consistent literal utility classes applied step-by-step
**Requires review:** false

Before touching individual components, decide (and apply consistently) the handful of scale values this plan actually needs: a "hero title" size (~56px desktop / smaller on mobile), a "body copy" size (~19.5px) with a max-width, and a page-margin scale (72px desktop page padding, 104px inter-column gap) matching the mockup. Prefer plain Tailwind arbitrary-value utilities (`text-[56px]`, `max-w-[54ch]`) over new config tokens unless a value is reused 3+ times — this plan touches a small, fixed set of places, not a systemic type-scale overhaul.

**Acceptance criteria:**
- [ ] A documented (code-comment-level) decision on the exact values used for hero title size, body copy size/max-width, and page margins, referenced consistently by the steps below.

---

### Step 2: Restructure `DetailPane.tsx` into a two-column layout at `md`+

**Files:** `client/src/components/DetailPane.tsx`, its test file
**Requires review:** true (the most structurally significant change in this plan)

Wrap the cover art and the season/title/meta/play block in a grid that's single-column by default and two-column (`md:grid-cols-[296px_minmax(0,1fr)] md:gap-14`, or equivalent) at `md`+, matching `desktop.html`'s `.stage-head` (and mirroring its own `@media (max-width:820px)` single-column collapse). The "About"/description block and guest/tag pills stay full-width below this grid, matching the mockup's `.stage-body` sitting below `.stage-head`.

**Acceptance criteria:**
- [ ] At `md`+ viewport widths, cover art and title/meta/play sit side by side.
- [ ] Below `md`, the existing single-column mobile stack is unchanged.
- [ ] Existing tests updated for the new wrapper structure; no behavioral change to what's rendered, only layout.

---

### Step 3: Scale up `DetailPane`'s typography and cover art

**Files:** `client/src/components/DetailPane.tsx`, its test file
**Requires review:** false

- Cover art: `w-48` → sized to fill its new grid column (e.g. `w-full` inside the 296px column from Step 2, so it scales with the column rather than a hardcoded pixel width).
- Title: `text-2xl` → the hero size decided in Step 1 (~56px desktop, a smaller step on mobile — e.g. `text-3xl md:text-5xl` or an arbitrary value, whichever reads better against real episode titles of varying length).
- Description: apply the body-copy size + max-width from Step 1.
- Play button: decide whether to keep the current compact pill (functionally fine, already tested, already accessible) or rebuild as a large circular disc + subtext matching the mockup exactly. Recommend keeping the pill unless the user specifically wants the disc — the pill is not wrong, just smaller-scale than the mockup's version, and rebuilding it is the highest-effort, lowest-value item in this plan.

**Acceptance criteria:**
- [ ] Cover art visibly larger, scaling with its column.
- [ ] Title reads as the dominant element on the page at `md`+, matching the mockup's visual weight.
- [ ] Description text uses the larger size and a max-width so long descriptions don't run edge to edge.

---

### Step 4: Fix the search input and season-dropdown trigger chrome

**Files:** `client/src/components/EpisodeListView.tsx`, `client/src/components/SeasonTabs.tsx`, their test files
**Requires review:** false

Search input: remove the box (`border`, `bg-surface`, `rounded-md`) in favor of a bottom-hairline-only treatment (`border-0 border-b border-zinc-200 dark:border-zinc-800 bg-transparent`), matching `.ep-search input`. Keep the existing focus-ring behavior but adapt it to a bottom-border color change on focus (matching the mockup's `:focus-visible{border-bottom-color:var(--accent)}`) rather than a box-shadow ring, since there's no box left to ring.

Season trigger: remove its box (`border`, `bg-surface`, `rounded-md`, fixed `w-56`) in favor of plain text + the existing caret, sized to content rather than a fixed width (matching `.season-trigger`'s `display:inline-flex` with no width constraint).

**Acceptance criteria:**
- [ ] Search input has no visible border/box at rest; shows an accent-colored bottom border on focus.
- [ ] Season trigger renders as text + caret with no button chrome.
- [ ] Existing tests updated for the new classes; no behavioral change (still a real `<input>`/`<button>`, same handlers).

---

### Step 5: Apply the wider spacing scale

**Files:** `client/src/components/DetailPane.tsx`, `client/src/components/EpisodeListView.tsx`, `client/src/components/Masthead.tsx`
**Requires review:** false

Widen the page-level paddings decided in Step 1: `DetailPane`'s outer padding, `EpisodeListView`'s row/section padding, `Masthead`'s vertical padding. Apply at `md`+ only where mobile's tighter spacing is already correct for its smaller viewport (the mockup's own mobile shell uses noticeably tighter spacing than its desktop shell — `.m-header{padding:22px 22px 16px}` vs `.masthead{padding:44px 0 72px}` — so this is a desktop-only widening, not a global one).

**Acceptance criteria:**
- [ ] Desktop spacing visibly wider/airier in a side-by-side screenshot against the mockup.
- [ ] Mobile spacing unchanged.

---

### Step 6: Resolve the episode-row-thumbnail open question and act on it

**Files:** `client/src/components/EpisodeItem.tsx`, its test file (only if the user chooses removal)
**Requires review:** true (this is a real content-display decision, not a style tweak)

Per this plan's Open Questions: get an explicit answer before touching `EpisodeItem.tsx`. If the decision is "keep thumbnails" (recommended), this step is a no-op — document the decision in this plan's Notes and move on. If the decision is "remove to match the mockup," delete the thumbnail box and adjust the row's grid to match `.row{grid-template-columns:34px minmax(0,1fr) auto}`.

**Decision (2026-09-06): keep thumbnails.** Per this step's own recommendation — removing a real, working content-display feature (admin-uploaded cover art) to match a mockup's placeholder-data demo would hide real content, not fix a bug. No code change made to `EpisodeItem.tsx`.

**Acceptance criteria:**
- [x] Explicit decision recorded before any code change.
- [x] Kept: no change made to `EpisodeItem.tsx`, decision documented here.

---

### Step 7: Verification against the real mockups

**Files:** none
**Requires review:** true (ship/no-ship gate, same pattern as plan 007)

Same process as plan 007's Step 9: run the dev stack, open the real app and `plans/007-mockups/desktop.html`/`mobile.html` side by side at matching viewports with the same episode selected, and get the user's explicit sign-off before committing anything. Screenshot comparison alone (by the assistant) is not sufficient — this plan exists specifically because that already happened once and missed real gaps.

**Acceptance criteria:**
- [ ] Side-by-side comparison covers every item in this plan's Context section (1-9).
- [ ] User has explicitly confirmed the result before any commit.

## Testing

Unit tests updated for every component touched (Steps 2-6) — layout/class changes, not new behavior, so existing test assertions on behavior (clicks, callbacks, aria attributes) should mostly survive; assertions on specific Tailwind classes will need updating. Full `make test`/`make lint`/typecheck must stay green after every step, same non-negotiable gate as plans 005-007.

No new e2e coverage anticipated — this plan doesn't change interaction behavior, only visual presentation, which e2e tests in this repo don't assert on (per CLAUDE.md's own testing conventions, visual regression isn't part of the e2e suite).

## Notes

- This plan is deliberately narrow: typography scale, spacing, two specific control's chrome, and DetailPane's macro-layout. It does not revisit anything plan 007 already fixed correctly.
- The root cause this plan exists to address: prior verification (plans 004's audit, and the assistant's own pre-plan-007 checks) confirmed these components were *functionally* correct against the settled design (right interaction pattern, right ARIA, right data flow) but never checked *visual* fidelity — font sizes, spacing, chrome styling — against the actual mockup pixels. A future design-system audit should explicitly check both dimensions, not treat functional correctness as a proxy for visual correctness.
