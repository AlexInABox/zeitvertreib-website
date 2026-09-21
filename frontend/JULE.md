# JULE

JULE is the design spec for the Zeitvertreib website: the dark, editorial look the
dashboard, landing page and every subpage share. The name is just the name of the
spec — the token prefix is `jule-`, and the stylesheet is `src/styles/jule.css`.

Before JULE the pages were a patchwork of PrimeNG components, glassy gradient cards and
light-mode defaults. JULE replaced that with one canvas, one accent and a lot of
hairlines.

## Where it lives

| Thing                                | File                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------- |
| Tokens, primitives and page patterns | `src/styles/jule.css` (imported once from `src/styles.css`)             |
| Shared nav + footer                  | `src/app/components/jule-nav/`, `src/app/components/jule-footer/`       |
| Shared components                    | `src/app/components/jule-nav/`, `jule-footer/`, `jule-dialog/`, `icon/` |

`src/styles/jule.css` is the single source of truth for colour, spacing and type. Pages
add layout in their own stylesheet and pull every primitive from JULE.

## Look

**Dark violet, not black.** The canvas is `#0d0b12`, a near-black with a violet cast.
Raised surfaces sit one step up at `#15121e`. Nothing is pure `#000`.

**One accent.** Brand purple (`#a13de6`) does all the work: links, active nav, focus,
chips, the primary button. The gradient stops from the logo (`#4d03a0`, `#7202a4`,
`#951079`) are available but used sparingly. Status colours — green, amber, red — are
the only sanctioned exception.

**Square corners.** No border radius anywhere in the page spec. Panels, buttons,
inputs, chips and tiles are all rectangles. The only round things are avatars and
progress dots.

**Hairlines, not shadows.** Separation comes from 1px lines (`--jule-line`) and soft
inner fills, not elevation. There are no drop-shadowed, floating cards. Dialogs get a
dimmed backdrop and nothing else. The landing page's console window (`.jule-window`) is
the one exception: a glass fill and deep shadow make it read as a floating terminal.

**A quiet grid.** `.jule-canvas` draws two vertical hairlines at the content edges that
run the full height of the page. Content sits inside a wide container
(`--jule-content`, up to 1600px) with a generous gutter.

**Little motion.** Transitions are limited to colour and background, 0.2s. The landing
page animates its headline in once; the advent calendar lets snow fall. Everything
honours `prefers-reduced-motion`.

## Type

Two faces:

- **Archivo Black** (`--jule-font-display`) for page titles, stat values and section
  headings. Tight tracking, `-0.02em`.
- **Inter** (`--jule-font-text`) for everything else.

Micro-labels (`.jule-eyebrow`, `.jule-panel-title`) are uppercase, `0.66rem`, wide
tracking. Numbers use tabular figures so columns line up. IDs, hashes and timestamps
use `.jule-mono`.

## Feel

JULE should read like a tool, not a brochure. Dense but calm. The user came to check
stats or file a report; the interface stays out of the way.

- Content first: the page title is the largest thing on screen, then the data.
- Flat and literal: a panel is a rectangle with a hairline border, not a glass card.
- One hierarchy: titles, values, labels and muted text. Not five shades of grey.
- Honest states: loading, empty and error each get a plain block (`.jule-state`) with
  an icon and one sentence.
- German copy, short and direct. No filler.

## Compared to mistral.ai

Mistral's site is the closest reference for the _attitude_:

- Oversized, declarative display type over short sentences. JULE uses the same
  headline-first layout (`.jule-page-title`, `.jule-h2`).
- Flat surfaces and thin rules instead of shadows and rounded cards. JULE shares this.
- A restrained palette where one hue carries the brand. Mistral uses orange on cream;
  JULE uses violet on near-black.
- Structured, editorial grids with clear rows and columns. JULE's `.jule-hairgrid`,
  `.jule-rows` and `.jule-table` follow the same idea.
- A small playful detail kept in an otherwise serious layout. Mistral has the cat; JULE
  has the snowfall on the advent calendar.

The difference: Mistral is light and warm, JULE is dark and cool, and JULE leans
harder on monospace for data. Same flatness, same confidence, different palette.

## Using it

Pull primitives from `src/styles/jule.css` — `jule-canvas`, `jule-page`, `jule-panel`,
`jule-btn`, `jule-chip`, `jule-input`, `jule-notice`, `jule-state`, `jule-spinner`,
`jule-stats`, `jule-gear`, `jule-rows`/`jule-item`, `jule-hairgrid`, `jule-pills`,
`jule-table`, `jule-mono`. Icons come from `app-icon` (`src/app/components/icon/`).

Rules:

- Reference tokens (`var(--jule-bg)`, `var(--jule-accent)`, `var(--jule-line)`, …).
  Never hardcode a hex in a page or component style. Add a token to `jule.css` if one
  is missing.
- Prefix new page classes with `jule-`. Page-specific layout can live in the page's own
  stylesheet; buttons, cards, chips, inputs, spinners, progress and dialogs do not.
- Corner radius stays `0`. Status colours (`#34d399`, `#eab308`, `#f0716f`) are the
  only place a non-brand hue is allowed.
- JULE is the only spec. PrimeNG (`pi pi-*`, `p-*`) and the former `@app/ui` library are
  gone; do not reintroduce them or add a second token set.

## Page shell

There is no global header or footer. Every page renders its own chrome:

```html
<div class="jule-canvas jule-canvas--fill">
  <app-jule-nav />
  <main class="jule-page">…</main>
  <app-jule-footer />
</div>
```

Add `jule-canvas--fill` when the content can be shorter than the viewport so the footer
sticks to the bottom. Dialogs use `<jule-dialog>` from `src/app/components/jule-dialog/`.
