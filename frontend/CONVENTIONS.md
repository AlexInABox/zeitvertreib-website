# Frontend Coding Conventions (`frontend/`)

This document outlines coding conventions for the Angular 22 frontend application. All AI agents and human developers must follow these patterns.

> [!NOTE]
> Conventions are always open to discussion! If you believe a convention should be clarified, updated, or removed, please open a GitHub Issue for discussion.

---

## 1. Skill Requirement

Always load the `angular-developer` skill before editing frontend code:
`.agents/skills/angular-developer/SKILL.md`

---

## 2. UI Library (`@app/ui`)

Reusable UI primitives live in the self-curated library at `projects/ui/` and are imported via the
`@app/ui` path alias (see [`projects/ui/README.md`](file:///home/bet/Projects/zeitvertreib/frontend/projects/ui/README.md)).

### ✅ DO (Correct)

```ts
import { ButtonComponent, CardComponent, BadgeComponent } from '@app/ui';
```

```html
<ui-card title="Titel" subtitle="Untertitel">
  <ui-button variant="primary">Speichern</ui-button>
</ui-card>
```

### Component rules

- All library components are **standalone**, use signal inputs, `ChangeDetectionStrategy.Eager`, and the `ui-` prefix.
- **Never hardcode hex/rgba in page or component styles** — reference the design tokens
  (`var(--ui-surface)`, `var(--ui-primary-grad)`, `var(--ui-focus-ring)`, …) defined in
  `projects/ui/src/lib/tokens/tokens.css`. Add new tokens there instead of inlining values.
- If a UI pattern exists in the library, use it — do **not** copy-paste a local `.btn`, `.badge`,
  `.dense-card`, `.dense-input`, `.loading-spinner`, `.progress-track`, or modal overlay recipe.
- Pages may keep page-specific layout styles (positioning, spacing, bespoke visuals) in their own
  stylesheet; primitives (buttons, cards, badges, inputs, spinners, progress, dialogs) come from the library.
- For native fields that need page-specific styling (e.g. icon-inside-input), apply the global
  `.ui-field` utility class instead of duplicating an input recipe.

---

## 3. PrimeNG Phase-out

PrimeNG is being removed from this codebase. **Do not import new PrimeNG modules or use `p-*`
components in templates.** Prefer the `@app/ui` library (section 2) or plain custom CSS.
Existing PrimeNG imports (`ButtonModule`, `CardModule`, `PrimeIcons`, `pi pi-*` icon classes) are
migrated to the library incrementally.

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
