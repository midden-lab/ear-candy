---
id: readability-contrast-fixes
title: "Episode row sizing, masthead legibility, and light/dark contrast fixes"
status: complete
priority: 1
created: 2026-09-08
steps_completed: 5
steps_total: 5
tags: [a11y, ux, frontend, visual-fidelity, css, wcag]
---

# Episode Row Sizing, Masthead Legibility, and Light/Dark Contrast Fixes

## Summary

Three real usability problems, confirmed with numbers rather than taken on faith: episode-list rows are ~20px tall (below even WCAG's 24px *minimum* tap-target size, let alone its 44px enhanced target), causing the reported accidental-episode-clicks; the masthead wordmark/tagline are undersized for a primary heading; and `--ink-3`/`--ink-4` (the two lightest text tokens in the neutral-scale palette) fail WCAG AA contrast (4.5:1) in **both** light and dark mode — light mode was the reported complaint, dark mode was found during this plan's audit and is fixed here too by explicit decision. This plan makes all three fixes as scoped, reviewed CSS changes with no component/markup changes and no test breakage.

## Context

This plan was produced with a dedicated accessibility audit and a frontend feasibility/blast-radius review (both completed before this plan was written — findings below are already verified, not hypotheses to re-check).

**Files involved:**
- `client/src/index.css` — `--ink-3`/`--ink-4` token values, `:root` (light) and `.dark` blocks.
- `client/src/styles/quiet-room.css` — the ~15 selectors currently on `--ink-4` that render real text (get reclassified to `--ink-3`), plus `.row`/`.row-title`/`.row-no`/`.row-time`/`.row + .row` (row sizing) and `.wordmark`/`.tagline`/`.m-wordmark`/`.m-tagline` (masthead sizing).
- No component/`.tsx` files change — every fix here is a CSS value or class-target change. `client/src/components/EpisodeItem.tsx` and `client/src/components/Masthead.tsx` are unmodified.

**Confirmed contrast ratios (WCAG relative luminance, verified independently twice):**

| Token | Mode | vs canvas (page bg) | vs surface (card/popover/dock bg) | Verdict |
|---|---|---|---|---|
| `--ink-3` | light | 2.74:1 | 3.16:1 | Fails AA text (4.5), fails AA-large (3.0) vs canvas |
| `--ink-4` | light | 1.75:1 | 2.01:1 | Fails badly everywhere |
| `--ink-3` | dark | 4.00:1 | 3.68:1 | Fails AA text (4.5) — pre-existing bug, not the original complaint |
| `--ink-4` | dark | ~2.0:1 | ~2.0:1 | Fails badly — same pre-existing bug |

Canvas is the harder (lower-contrast) background in light mode since `--canvas` (#EEEFF0) is darker than `--surface` (#FFFFFF); any replacement value must clear AA against canvas, not just against white.

**Selectors currently on `--ink-4` that render real informational text and must move to `--ink-3`** (confirmed via full grep of `quiet-room.css`, not a partial list): `.station`, `.admin-link`, `.art-no`, `.season-option .opt-count` (unselected state only — the `[aria-selected="true"]` variant already uses `--accent`), `.season-count`, `.row-no`, `.row-time`, `.row-season-tag-inline`, `.times .total`, `.status`, `.m-tabbar button` (default/unselected state only — `[aria-current="true"]` already uses `--accent`), `.m-np-status`, `.share-close`, `.themeswitch button` (default state only — `[aria-pressed="true"]` already uses `--ink`), `.share-btn`.

**Selectors that stay on `--ink-4`** because they're genuinely decorative/non-text, not informational content a listener needs to read (`--ink-4`'s new value only needs to clear the lower 3:1 non-text/graphical-object floor, not 4.5:1): `.season-trigger .caret` (dropdown chevron icon), `.themeswitch .sep` (the `/` punctuation separator between Light/Dark), `.ep-meta .dot` (the `·` punctuation separator in episode metadata).

**Row/list container margins are untouched.** `.list { margin: 22px -18px 0 }` (desktop) and `.m-list { margin: 0 -10px }` (mobile) were confirmed to predate the row-padding-removal (plans/011) and to already differ by breakpoint for reasons unrelated to this plan (desktop's `-18px` cancels an 18px row padding for a full bleed; mobile's `-10px` gives a deliberately smaller inset against `.m-scroll`'s own padding). Restoring `.row`'s horizontal padding to `18px` (Step 1) exactly reproduces the pre-011 desktop bleed alignment with zero changes needed to either margin rule.

**Decided, not open:** per explicit review, this plan targets the fuller WCAG AAA-influenced row size (~44px rows) over a more conservative minimum-clearing bump, and fixes the dark-mode contrast bug in the same pass rather than filing it separately — both decided directly against the audit's findings, see Steps 1 and 3.

**Confirmed zero test/e2e impact** (frontend feasibility review): `client/src/tests/EpisodeItem.test.tsx` and `client/src/tests/Masthead.test.tsx` assert only class names, text content, and ARIA attributes — never computed style, font-size, padding, or color. `client/src/tests/PlaybackStatusLine.test.tsx` asserts the Tailwind class name `text-ink-3` (which maps straight to `var(--ink-3)` per `tailwind.config.ts`), not a resolved color — safe. No `e2e/tests/*.spec.ts` file uses `.boundingBox()`/`getBoundingClientRect()` against an episode row (the only two `boundingBox()` uses in the suite, in `mobile.spec.ts`, compare the mini-player against the tab bar — unrelated). `make lint`/`make typecheck` don't process CSS files at all in this repo's config. This plan is not expected to touch any test file; Step 4 exists as the explicit checkpoint if that assumption turns out wrong.

**Out of scope, flagged for a possible future look, not fixed here:** the dock's `.skip` button (34×34px) clears WCAG's 24×24 AA minimum but misses the 44×44 AAA target hit by the episode rows in this plan. Not part of the reported complaint and not blocking — left as-is.

## Steps

### Step 1: Enlarge episode rows and increase inter-row spacing

**Files:** `client/src/styles/quiet-room.css`

**Requires review:** true — more than doubles row height (~20px → ~44px), a real density/visual change to the primary listening surface on both breakpoints, not just a number tweak.

Change:
```css
.row { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: baseline; gap: 14px; width: 100%; text-align: left; padding: 0; transition: background-color .16s var(--ease); border-radius: 2px; }
.row + .row { margin-top: 1px; }
.row-no { font-family: var(--mono); font-size: 11px; color: var(--ink-4); letter-spacing: .03em; font-variant-numeric: tabular-nums; }
.row-title { font-size: 15px; font-weight: 400; letter-spacing: -.014em; color: var(--ink-2); line-height: 1.35; transition: color .16s var(--ease); }
.row-time { font-family: var(--mono); font-size: 11px; color: var(--ink-4); letter-spacing: .02em; font-variant-numeric: tabular-nums; white-space: nowrap; }
```
to:
```css
.row { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: baseline; gap: 14px; width: 100%; text-align: left; padding: 10px 18px; transition: background-color .16s var(--ease); border-radius: 2px; }
.row + .row { margin-top: 4px; }
.row-no { font-family: var(--mono); font-size: 12.5px; color: var(--ink-3); letter-spacing: .03em; font-variant-numeric: tabular-nums; }
.row-title { font-size: 16px; font-weight: 400; letter-spacing: -.014em; color: var(--ink-2); line-height: 1.35; transition: color .16s var(--ease); }
.row-time { font-family: var(--mono); font-size: 12.5px; color: var(--ink-3); letter-spacing: .02em; font-variant-numeric: tabular-nums; white-space: nowrap; }
```
(Note: `.row-no`/`.row-time` also switch from `--ink-4` to `--ink-3` here, consistent with the reclassification list in Context — do this now rather than duplicating the edit in Step 3.)

Also update the two states that override `.row-no`/`.row-time`'s color, so they still read correctly against the new base:
```css
.row.is-viewed .row-no { color: var(--ink-3); }
.row.partial .row-time { color: var(--ink-3); }
```
These already target `--ink-3` and need no change — leave them exactly as-is (they were already correct; only the *base*, non-active-state color was on `--ink-4`).

Do not touch `.list`/`.m-list` margins, `grid-template-columns`, or `gap` — per Context, the 18px horizontal padding chosen here exactly reproduces the pre-plans/011 desktop bleed alignment against `.list`'s existing `-18px` margin with no other change required.

**Acceptance criteria:**
- [ ] `.row`'s computed height is ~44px (verified in a running browser, not just by reading the CSS).
- [ ] `.row-title` renders at 16px, `.row-no`/`.row-time` at 12.5px, verified via computed style.
- [ ] Visible ~4px gap between consecutive rows.
- [ ] Desktop row content still bleeds flush to the same edge as before (no visible gap or overhang against `.list`'s negative margin).
- [ ] `make test` and `make lint` (client) pass unchanged.

---

### Step 2: Increase masthead text size

**Files:** `client/src/styles/quiet-room.css`

**Requires review:** false — pure font-size bumps, no layout/structural change.

Change:
```css
.wordmark { font-size: 19px; font-weight: 600; letter-spacing: -.022em; line-height: 1.2; margin: 0; }
.tagline { margin: 5px 0 0; font-size: 13.5px; font-weight: 400; color: var(--ink-3); letter-spacing: -.004em; }
```
to:
```css
.wordmark { font-size: 23px; font-weight: 600; letter-spacing: -.022em; line-height: 1.2; margin: 0; }
.tagline { margin: 5px 0 0; font-size: 15px; font-weight: 400; color: var(--ink-3); letter-spacing: -.004em; }
```
and:
```css
.m-wordmark { font-size: 16px; font-weight: 600; letter-spacing: -.02em; margin: 0; }
.m-tagline { margin: 3px 0 0; font-size: 11.5px; color: var(--ink-3); }
```
to:
```css
.m-wordmark { font-size: 19px; font-weight: 600; letter-spacing: -.02em; margin: 0; }
.m-tagline { margin: 3px 0 0; font-size: 13px; color: var(--ink-3); }
```

**Acceptance criteria:**
- [ ] Desktop `.wordmark` computes to 23px, `.tagline` to 15px.
- [ ] Mobile `.m-wordmark` computes to 19px, `.m-tagline` to 13px.
- [ ] Masthead doesn't visibly overlap or crowd the station/theme-switch/admin controls at typical desktop widths — check at the `1180px` breakpoint where `.room`'s padding already shrinks.
- [ ] `make test` and `make lint` (client) pass unchanged.

---

### Step 3: Fix light- and dark-mode text contrast

**Files:** `client/src/index.css`, `client/src/styles/quiet-room.css`

**Requires review:** true — the broadest-blast-radius step in this plan: two token values change, and ~13 additional selectors (beyond `.row-no`/`.row-time`, already done in Step 1) move from `--ink-4` to `--ink-3`, touching text across the masthead, dock, share dialog, season picker, and mobile tab bar on both breakpoints and both themes.

**3a. Update token values** in `client/src/index.css`:

Light mode (`:root` block):
```css
--ink-3: #8E9197;
--ink-4: #B4B7BC;
```
to:
```css
--ink-3: #67696E;
--ink-4: #868990;
```

Dark mode (`.dark` block):
```css
--ink-3: #75727A;
--ink-4: #4C4A51;
```
to:
```css
--ink-3: #8D8A93;
--ink-4: #6A676F;
```

**3b. Reclassify text-bearing selectors from `--ink-4` to `--ink-3`** in `client/src/styles/quiet-room.css` (all still function as `color: var(--ink-3)`, just pointing at the darker/lighter-per-theme token now — this is a find-and-replace of `var(--ink-4)` to `var(--ink-3)` on exactly these selectors, nothing else):

- `.station`
- `.admin-link`
- `.art .art-no`
- `.season-option .opt-count` (the base rule only — leave `.season-option[aria-selected="true"] .opt-count { color: var(--accent); }` untouched)
- `.season-count`
- `.times .total`
- `.status`
- `.m-tabbar button` (the base rule only — leave `.m-tabbar button[aria-current="true"] { color: var(--accent); ... }` untouched)
- `.m-np-status`
- `.share-close`
- `.themeswitch button` (the base rule only — leave `.themeswitch button[aria-pressed="true"] { color: var(--ink); ... }` untouched)
- `.share-btn`

Do **not** change `.season-trigger .caret`, `.themeswitch .sep`, or `.ep-meta .dot` — these stay on `--ink-4` per Context (decorative/punctuation, not informational text, and the new `--ink-4` value only targets the lower 3:1 non-text floor).

**Acceptance criteria:**
- [ ] Computed color of `.row-title` text against `--canvas` (light mode) measures ≥4.5:1 — already true before this step (`--ink-2`), confirm unaffected.
- [ ] Computed color of `.row-no`/`.row-time`/`.station`/`.tagline`/`.admin-link`/`.share-btn` text against their real rendered background (canvas or surface, whichever applies) measures ≥4.5:1 in both light and dark mode.
- [ ] `.season-trigger .caret` and other retained-`--ink-4` decorative elements still render visibly distinct/lighter than the reclassified text — the two tiers remain visually separable, not identical.
- [ ] No visual regression where an already-`--accent`-colored active/selected state (e.g. `.opt-count` when selected, `.m-tabbar button[aria-current]`, `.themeswitch button[aria-pressed]`) was accidentally touched — these must be unchanged.
- [ ] `make test` and `make lint` (client) pass unchanged.

---

### Step 4: Full client quality gate

**Files:** none (verification only)

**Requires review:** false

Run `make test`, `make lint`, and (from `client/`) `npx tsc --noEmit`. Per Context, no test file is expected to need changes — this step is the explicit checkpoint in case that assumption is wrong (fix forward, don't defer).

**Acceptance criteria:**
- [ ] `make test` fully green (server unaffected — this plan is client CSS only).
- [ ] `make lint` clean.
- [ ] `tsc --noEmit` clean.

---

### Step 5: Live verification across both breakpoints and both themes

**Files:** none (verification only)

**Requires review:** false

With the dev stack running (`make up`), check in a real browser:
1. Desktop and mobile (~390px) episode lists: rows read as noticeably easier to click/tap, with clear visual separation between adjacent rows; confirm roughly how many rows now fit above the fold vs. before (expected: fewer, given ~44px rows — note the actual before/after count, don't just assert it's fine).
2. Masthead at both breakpoints: wordmark and tagline read as clearly larger; no overlap with the station/theme-switch/admin cluster on desktop at both a wide viewport and the `1180px` narrow-desktop breakpoint.
3. Light mode: spot-check `.row-time`, `.row-no`, `.tagline`, `.station`, `.share-btn` text against a real screenshot or a manual contrast-checker reading — confirm all read clearly against their background, not just "technically 4.5:1 on paper."
4. Dark mode: same spot-check — confirm the dark-mode fix didn't overcorrect into a washed-out or harsh look, and that the two reclassified tiers (`--ink-3` now doing more work) still feel like a coherent hierarchy against `--ink`/`--ink-2`.
5. Confirm no build-time visual breakage in the season popover, share dialog, or mobile season picker (all consume the reclassified selectors) in both themes.

**Acceptance criteria:**
- [ ] Screenshots or explicit description captured for desktop + mobile, light + dark (4 states minimum).
- [ ] All 5 checks above explicitly reported, not silently assumed.

## Testing

All three fixes are CSS value/selector-target changes only — no new component logic, no new markup, no className changes. Per the pre-plan frontend feasibility review, no existing unit or e2e test touches computed style, color, or row/masthead geometry, so no new automated test coverage is expected; Step 4 is the catch-all if that assumption is wrong, and Step 5's live/visual check is the real verification for this class of change, consistent with how this project has repeatedly found source-level CSS review insufficient on its own (see plans/011, plans/012).

## Notes

- This plan's contrast fix intentionally collapses some of the visual distance between `--ink-3` and `--ink-4` (both had to move toward the dark end of the scale to pass WCAG), and reassigns roughly 13 selectors that were incorrectly using the decorative-tier token for real text. If a future change wants to reintroduce a very light "quiet" tier, it needs a *new* token reserved strictly for verified non-text/decorative use — reusing `--ink-4` for both purposes is exactly the mistake this plan fixes.
- The dock's `.skip` button (34×34px, clears AA's 24×24 minimum but misses the 44×44 AAA target hit by episode rows here) is a known, smaller-scale instance of the same tap-target class of issue, deliberately left out of this plan's scope — worth a look if further mis-click reports come in around playback controls specifically, rather than the episode list.
- Dark-mode's contrast bug was not part of the original complaint; it's fixed here by explicit decision (see Context) rather than filed separately, since the token-value change in Step 3 already has to touch both `:root` and `.dark` blocks in the same file.
