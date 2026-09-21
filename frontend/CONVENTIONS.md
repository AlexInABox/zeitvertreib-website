# Frontend Coding Conventions (`frontend/`)

This document outlines coding conventions for the Angular 22 frontend application. All AI agents and human developers must follow these patterns.

> [!NOTE]
> Conventions are always open to discussion! If you believe a convention should be clarified, updated, or removed, please open a GitHub Issue for discussion.

---

## 1. Skill Requirement

Always load the `angular-developer` skill before editing frontend code:
`.agents/skills/angular-developer/SKILL.md`

---

## 2. Design Spec (JULE)

JULE is the **only** design spec in this codebase. The full description lives in
[`JULE.md`](JULE.md); the tokens and primitives live in `src/styles/jule.css`.

### ✅ DO (Correct)

```html
<section class="jule-panel">
  <div class="jule-panel-head">
    <span class="jule-panel-title">Titel</span>
    <span class="jule-chip jule-chip--ok">Aktiv</span>
  </div>
  <div class="jule-panel-body">
    <button type="button" class="jule-btn" (click)="save()">Speichern</button>
  </div>
</section>
```

### Component rules

- Use the `jule-*` classes: `jule-canvas`, `jule-page`, `jule-panel`, `jule-panel-head`,
  `jule-panel-body`, `jule-btn` (+ `--ghost`, `--danger`, `--icon`, `--wide`), `jule-input`,
  `jule-select`, `jule-chip`, `jule-notice`, `jule-state`, `jule-spinner`, `jule-stats`,
  `jule-gear`, `jule-rows`, `jule-item`, `jule-hairgrid`, `jule-table`, `jule-mono`.
- **Never hardcode hex/rgba in page or component styles** — reference the JULE tokens
  (`var(--jule-bg)`, `var(--jule-panel)`, `var(--jule-line)`, `var(--jule-text)`,
  `var(--jule-muted)`, `var(--jule-accent)`, `var(--jule-font-display)`, …). Add a token to
  `jule.css` instead of inlining a value. Status colours (`#34d399`, `#eab308`, `#f0716f`)
  are the only sanctioned exception.
- **Corners stay sharp.** No `border-radius` on cards, buttons, inputs, panels or chips.
  Only avatars and small dots are round.
- No glass effects, no drop-shadowed cards. Separation is hairline borders and flat surfaces.
- Shared UI lives at `src/app/components/jule-nav/`, `jule-footer/`, `jule-dialog/` and
  `icon/`. Icons come from `app-icon`; list available names in
  `src/app/components/icon/icon.component.ts`.
- Page-specific layout (positioning, spacing, bespoke visuals) may live in the page's own
  stylesheet; primitives do not.

---

## 3. No other design specs

PrimeNG, PrimeIcons and the former `@app/ui` component library have been removed. Do not
reintroduce them, and do not add a second token set or theme.

- **Do not** import `primeng`, `primeicons` or `@primeuix/*`, and do not use `p-*`
  components or `pi pi-*` icon classes.
- **Do not** add another `--something-*` token system or a light/dark theme switch. The app
  is dark-mode only; `JULE.md` is the spec.
- Use a JULE primitive before writing a new component; if a primitive is missing, add it to
  `jule.css` and document it in `JULE.md`.

---

## 4. Monorepo Shared Types

Always import shared API data models and type definitions directly from `@zeitvertreib/types`.

### ✅ DO (Correct)

```typescript
import type { UserProfile, StatsResponse } from '@zeitvertreib/types';
```

### ❌ DON'T (Forbidden)

```typescript
// Redefining local interfaces or using `any` is forbidden
interface UserProfile {
  name: string;
  id: string;
}
```
