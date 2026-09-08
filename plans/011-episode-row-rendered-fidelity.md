---
id: episode-row-rendered-fidelity
title: "Episode row: match the mockup's actual rendered pixels, not its declared CSS"
status: complete
priority: 1
created: 2026-09-08
steps_completed: 4
steps_total: 4
tags: [design-system, ux, frontend, visual-fidelity, css]
---

# Episode Row: Rendered-Fidelity Fix

## Summary

Plan 010 ported the mockup's CSS verbatim, including `.row`'s `padding: 15px 18px` and `.row.is-viewed`'s `background: var(--surface)`. Both are real, present rules in the mockup's source — but a frontend-engineer + test-engineer review (one auditing source, one measuring real `getComputedStyle()` output in a live-rendered browser) confirmed the mockup's own CSS has a specificity bug: a generic `#app-root button{background:none; padding:0; border:0}` reset (ID selector, specificity 1,0,1) silently beats both `.row{padding:...}` and `.row.is-viewed{background:...}` (class selectors, specificity 0,1,0 / 0,2,0) in the mockup's *own* render. The mockup you actually see in a browser has ~20px-tall rows with zero internal padding and an active row that shows only a subtle box-shadow — never the filled background or generous padding its CSS declares. Plan 010 faithfully ported the declaration, which is exactly backwards from what a human comparing the two UIs side-by-side perceives as "the mockup." The user confirmed: match the rendered pixels, bug and all, not the unreached declaration.

## Context

**Confirmed by two independent reviews (frontend-engineer source audit + test-engineer empirical `getComputedStyle()`/screenshot comparison) — do not re-litigate, just fix:**
- Fonts, font sizes, weights, letter-spacing, and colors on `.row`/`.row-no`/`.row-title`/`.row-time` are byte-identical between mockup and app already. Not part of this fix.
- `.row.is-viewed` computed `background-color` in the live mockup: `rgba(0,0,0,0)` (transparent). In the live app: `rgb(27,25,32)` (a real, visible fill — `var(--surface)` genuinely applies here because this app never ported the `#app-root button{background:none}` reset that neutralizes it in the mockup). Only the `box-shadow` (identical string in both) and the `.row-title`/`.row-no` color/weight bumps actually render as a highlight in the mockup.
- `.row` computed `padding` in the live mockup: `0px` (confirmed geometrically — `.row-no`'s left edge equals `.row`'s own left edge). Live app: `15px 18px` as declared. Measured row height: mockup ≈ 20.25px, app ≈ 50.25px.
- `.list{margin: 22px -18px 0}` (the negative-margin full-bleed trick) renders identically in both — untouched by this fix, it's a `<div>` not a `<button>`, so the button reset never applied to it in the mockup either.
- User's explicit decision (asked directly, given the tradeoff): match the mockup's rendered pixels for both the active-row fill and the row height/padding, even though ~20px rows are unusually compact and this may read as a mobile tap-target concern — flagged for a look during Step 4's live check, not a blocker to implementing as decided.

**Files involved:** `client/src/styles/quiet-room.css` (the `.row`/`.row.is-viewed` rules, lines 98 and 107-108 as of this writing), `client/src/tests/EpisodeItem.test.tsx` (existing active-state test, currently agnostic to background — verify it stays that way, don't let it start asserting a fill), `e2e/tests/listener.spec.ts` (has an existing `.row.is-viewed` assertion from plan 010's e2e fixes to double check).

**Not in scope:** `.row-title`/`.row-no`/`.row-time`/`.row-season-tag-inline` typography (already confirmed matching), `.list` margin/bleed mechanics (already confirmed matching), the EQ-bars indicator inside `.row-time` (an Ear-Candy addition with no mockup equivalent, already a settled, disclosed deviation from plan 010 — not touched here).

## Steps

### Step 1: Remove the active-row background fill

**Files:** `client/src/styles/quiet-room.css`

**Requires review:** false

Change:
```css
.row.is-viewed { background: var(--surface); box-shadow: var(--shadow-row); }
.row.is-viewed:hover { background: var(--surface); }
```
to:
```css
.row.is-viewed { box-shadow: var(--shadow-row); }
```
and delete the `.row.is-viewed:hover` rule entirely (with no `background` declared on `.is-viewed` at all, `:hover`'s own base `.row:hover{background:var(--wash)}` would otherwise apply on hover — the mockup's real behavior, per the same rendered-output check, is that a hovered active row shows no wash tint either, since `.row.is-viewed:hover{background:var(--surface)}` was itself also neutralized by the same button-reset bug, net rendered result: `rgba(0,0,0,0)` unconditionally). Confirm this specific sub-case (hovering an already-active row) empirically in Step 4 rather than assuming — the review didn't explicitly measure the hover-while-active state.

Leave `.row.is-viewed .row-title{color:var(--ink);font-weight:500}` and `.row.is-viewed .row-no{color:var(--ink-3)}` untouched — both were confirmed to render correctly as declared in the mockup (no specificity conflict, these aren't background/padding on a button element's own box).

**Acceptance criteria:**
- [ ] `.row.is-viewed` has no `background` property at all (nothing to be overridden by anything, matching the mockup's real end-state directly rather than reintroducing a similar specificity race).
- [ ] Active row still shows the shadow and the brighter/bold title text.
- [ ] `make test` and `make lint` (client) pass unchanged — no test currently asserts a background on `.is-viewed`, confirm that stays true rather than adding one.

---

### Step 2: Shrink row padding to match the mockup's real rendered row height

**Files:** `client/src/styles/quiet-room.css`

**Requires review:** true — this is the more consequential, user-confirmed-but-unusual change (rows drop from ~50px to ~20px tall), and it changes the episode list's overall density and touch-target size, not just one component's internal styling. Worth a deliberate look before and after, not a silent one-line edit.

Change:
```css
.row { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: baseline; gap: 14px; width: 100%; text-align: left; padding: 15px 18px; transition: background-color .16s var(--ease); border-radius: 2px; }
```
to:
```css
.row { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: baseline; gap: 14px; width: 100%; text-align: left; padding: 0; transition: background-color .16s var(--ease); border-radius: 2px; }
```

Do not adjust `grid-template-columns`, `gap`, `.list`'s margin, or anything else — the padding is the only property confirmed to differ from the mockup's real render. This will also shift the row's horizontal text alignment relative to the search box/season-toolbar above it (which keep their own unaffected margins, since they aren't buttons) — this is a real, direct consequence of matching the mockup's actual bug-affected geometry, not a mistake; confirm in Step 4 whether it looks like a deliberate, acceptable outcome or genuinely broken before shipping.

**Acceptance criteria:**
- [ ] `.row`'s computed padding is `0px` on all sides, verified via a real browser check (not just reading the CSS), matching the mockup's measured ~20px row height.
- [ ] `make test` and `make lint` (client) pass unchanged.

---

### Step 3: Re-run the client quality gate and fix any fallout

**Files:** any test file the above two CSS-only changes turn out to affect (expected: none, since both are pure CSS property removals with no className/markup changes in `EpisodeItem.tsx`)

**Requires review:** false

Run `make test`, `make lint`, and (from `client/`) `npx tsc --noEmit`. This step exists as an explicit checkpoint in case a snapshot-style test or an e2e spec (`e2e/tests/listener.spec.ts`'s `.row.is-viewed` assertion from plan 010) turns out to assert something about background/padding this plan didn't anticipate — fix forward rather than deferring.

**Acceptance criteria:**
- [ ] `make test` fully green (server unaffected — this plan is two CSS property changes, client-only).
- [ ] `make lint` clean.
- [ ] `tsc --noEmit` clean.

---

### Step 4: Live verification — screenshots + the two flagged edge cases

**Files:** none (verification only)

**Requires review:** false

With the dev stack running (`make up`), screenshot the episode list at both a desktop width and a real mobile viewport (~390px), with at least one row active/viewed and one row showing `is-playing`/`partial` state (EQ indicator / "X left" text), and specifically check:
1. Active row height now reads as compact (~20px), and shows shadow + bold/bright title only, no background fill — matching the mockup's real appearance, not its CSS text.
2. Hover an already-active row (Step 1's flagged open question) — confirm whether a wash tint appears or not, and that whichever it is matches the mockup's own real hover-while-active behavior (check by hovering the equivalent row in the mockup file directly in a browser, don't just trust the earlier review's inference).
3. Compare the row text's horizontal alignment against the search box and season-selector row directly above it — report plainly whether the mismatch (rows now start flush at the bled-out edge, ~18px further out than the search box) reads as intentional/acceptable or as a visual glitch, since this was a known, accepted consequence of the user's decision but hasn't been seen rendered yet.
4. Confirm real mobile tap-target usability isn't badly broken at ~20px row height — this was raised as a concern before the user's decision; report what it actually looks and feels like now that it's built, without re-opening the decision unprompted.

**Acceptance criteria:**
- [ ] Screenshots captured for both breakpoints, active + non-active + playing/partial row states.
- [ ] All three flagged edge cases (hover-while-active, horizontal alignment vs. toolbar, mobile tap-target feel) explicitly reported, not silently accepted either way.

## Testing

Both source changes are CSS-only property removals — no `EpisodeItem.tsx` markup or className changes, so no new unit test coverage is expected (Step 3 is the explicit catch-all if that assumption turns out wrong). Real visual/behavioral confirmation happens in Step 4 via direct browser inspection, consistent with how this project has repeatedly found that source-level CSS review alone is insufficient for this exact class of specificity bug — computed-style/rendered verification is the actual test here, not a unit test file.

## Notes

- This plan exists because plan 010 (Step 3) re-derived `.row.is-viewed`'s background from the mockup's *declared* CSS without re-running the same computed-style check that an earlier plan (009) had already used to catch this exact bug for the same rule — the earlier fix was silently reverted by porting the literal source text. If any future plan touches `.row`/`.row.is-viewed`/`.list` again, re-verify against a fresh `getComputedStyle()` pass on the actual mockup file before changing anything, not just the CSS source.
- The row-padding removal is a deliberate, user-confirmed choice to match a bug in the reference mockup rather than its evident design intent. If this reads poorly once seen live (Step 4), the fix is a one-line revert of Step 2 alone — Step 1's background fix stands on its own regardless of how the padding question resolves.
