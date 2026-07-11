# Ear Candy — Design Tokens & Conventions

Reference extracted from the actual client source (`client/tailwind.config.ts`, `client/src/index.css`, and real usage across `client/src/components/`). This isn't an aspirational style guide — every value below is currently rendered somewhere in the app. Use it to keep new UI on-brand, or as context for a tool building on-brand mockups.

Ear Candy uses stock Tailwind CSS (`tailwind.config.ts` has no theme extension — `theme: { extend: {} }`) plus **one** custom CSS variable for brand color. Everything else is Tailwind's default palette and scale.

## Brand color

```css
:root {
  --accent: #5a3ef5; /* violet-indigo, the only brand color */
}
```

- Default value above; overridden per-deployment by the podcast's configured `accent_color` setting (set via `document.documentElement.style.setProperty('--accent', ...)` in `useTheme.ts`).
- Referenced in Tailwind classes as an arbitrary value: `bg-[var(--accent)]`, `text-[var(--accent)]`, `border-[var(--accent)]`, `ring-[var(--accent)]`, `accent-[var(--accent)]` (native `<input type="range">` thumb color).
- Used for: primary actions (play button, "+ New Season"), active/selected state (active season tab, active episode's left border), and small brand accents (logo icon, focus rings).

## Color palette

**Always dark.** `darkMode: 'class'` exists but `body` is unconditionally `bg-zinc-950 text-zinc-100` — light mode is a toggle-able exception (`ThemeBadge`/`useTheme`), not the default design.

Zinc is the entire neutral scale — no gray/slate mixed in. Usage by role, darkest to lightest:

| Class | Role |
|---|---|
| `bg-zinc-950` | Page/app background |
| `bg-zinc-900` | Raised surfaces — player bar, season card header, admin panel background |
| `bg-zinc-800` | Interactive surface (hover states, input fields), `bg-zinc-800/60` for a subtler active-row fill |
| `bg-zinc-700` | Hover state on an already-raised `zinc-800` surface |
| `border-zinc-800` | Standard hairline divider/border |
| `border-zinc-700` | Slightly more visible border (dashed "add" buttons, ring accents) |
| `text-zinc-100` | Primary text / headings |
| `text-zinc-300` | Secondary body text |
| `text-zinc-400` | Tertiary text, inactive nav/tab labels, icon default color |
| `text-zinc-500` | Metadata (timestamps, durations, placeholder text) |

### Semantic accent colors

Used sparingly, only for these specific meanings — don't introduce new hues:

| Color | Meaning | Real usage |
|---|---|---|
| `blue-900` bg / `blue-200` text | Guest name pills | `PillBadge` in episode detail |
| `purple-900` bg / `purple-200` text | Tag pills | `PillBadge` in episode detail |
| `red-400` text / `red-950` bg hover / `red-300` hover text | Destructive actions | Delete buttons (season/episode) |
| `green-400` | Success/confirmation text | Upload-complete message |

Focus rings use the brand accent, not a separate color: `outline-none focus:ring-2 focus:ring-[var(--accent)]` (form inputs, e.g. `AdminLogin.tsx`).

## Typography

No custom font family — system default (Tailwind's default sans stack). Scale in actual use:

| Class | Usage |
|---|---|
| `text-2xl font-bold` | Episode detail title (largest text in the app) |
| `text-xl` | (available, used sparingly) |
| `text-lg font-semibold` | Section headings (e.g. "Ear Candy Admin") |
| `text-sm font-medium` / `font-semibold` | Body text, nav labels, form labels |
| `text-xs` | Metadata, pills, uppercase eyebrow labels (`uppercase tracking-wider`) |

## Spacing & shape

- **Padding scale in use:** `p-1`, `p-1.5`, `p-2`, `p-2.5`, `p-3`, `p-4`, `p-6`, `p-8` (stock Tailwind scale, nothing custom).
- **Gap scale in use:** `gap-1`, `gap-1.5`, `gap-2`, `gap-3`, `gap-8` and `space-y-{1,2,4,6}` for vertical stacks.
- **Corner radius:** `rounded` (default) for small chips/buttons, `rounded-lg`/`rounded-xl` for cards and panels, `rounded-full` for pills, badges, and icon/avatar buttons, `rounded-2xl` for the largest surfaces (login card).
- **Elevation:** flat by default (no shadow) — `shadow-lg`/`shadow-xl` reserved for floating/overlaid elements (cover art, dropdown menus, theme toggle badge). `ring-1 ring-zinc-700` substitutes for a border on floating circular elements.
- **Motion:** `transition-colors` is the default on every interactive element; `transition-opacity` for press states on filled buttons (hover:opacity-90); `transition-transform` only for the mobile now-playing overlay's slide animation, and that specific one respects `motion-reduce:transition-none`.

## Component patterns (real class strings)

**Primary filled button** (e.g. "+ New Season", form Save button):
```
rounded bg-[var(--accent)] px-4 py-2 text-sm text-white hover:opacity-90
```

**Secondary/ghost button** (Cancel button, `EpisodeFormPanel.tsx`):
```
rounded bg-zinc-800 py-2 text-zinc-300 hover:bg-zinc-700
```
or, for icon-only nav buttons: `rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors`.

**Destructive/delete button:**
```
text-red-400 hover:bg-red-950 hover:text-red-300
```

**Pill badge** (`PillBadge.tsx` — guests, tags):
```
inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
```
plus a semantic color pair from the table above.

**Card/panel surface** (season card, `SeasonBlock.tsx`):
```
rounded-xl border border-zinc-800 overflow-hidden
```
with an inner header row on `bg-zinc-900` (`flex items-center justify-between px-4 py-3 bg-zinc-900`) — the card itself is transparent over the page background, only its header/rows carry surface color.

**Active/selected state** (season tab, active episode row): filled `bg-[var(--accent)] text-white` for tabs; a left accent border (`border-l-2 border-[var(--accent)] bg-zinc-800/60`) for list rows — **never** a solid accent fill on a list row, that's reserved for tabs/buttons.

## Accessibility conventions

- **Touch targets:** interactive controls should be ≥44px (`h-11 w-11` / `min-h-11`) on any surface that renders at phone width — established during the mobile-responsive pass (`AudioPlayer`, `ThemeBadge`, `SeasonTabs`). Desktop-only compact controls (e.g. the desktop player's `p-1` skip buttons) are exempt.
- **Accessible names over `aria-label` overrides:** prefer visible text as the accessible name; when a label needs disambiguating context (e.g. which episode a Delete button acts on), use `aria-describedby` pointing at existing visible text rather than overriding `aria-label` with a value that doesn't contain the visible label — avoids WCAG 2.5.3 violations and breaks fewer scripts/tests that match by name.

## Source of truth

- `client/tailwind.config.ts` — confirms there is no custom theme, only stock Tailwind + `darkMode: 'class'`.
- `client/src/index.css` — the only global CSS: `--accent`, `--player-h`, and the equalizer-bar keyframe animation.
- `client/src/components/` — every pattern above is copied verbatim from real component code, not invented.

This doc is a snapshot, not generated — if the palette or component patterns drift, re-grep `client/src` for `bg-`/`text-`/`border-` class usage rather than trusting this file blindly.
