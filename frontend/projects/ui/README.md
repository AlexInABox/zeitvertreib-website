# @app/ui — Zeitvertreib UI Library

Self-created, self-curated component library for the Zeitvertreib frontend. Implements the
ShadCN-style primitives that replace PrimeNG (see `frontend/CONVENTIONS.md`).

## Usage

Import components directly from the barrel:

```ts
import { ButtonComponent, CardComponent, BadgeComponent, SpinnerComponent } from '@app/ui';

@Component({
  selector: 'app-example',
  imports: [ButtonComponent, CardComponent],
  template: `
    <ui-card title="Title" subtitle="Subtitle">
      <app-icon uiCardIcon name="info" />
      <ui-button variant="primary" (click)="save()">Speichern</ui-button>
    </ui-card>
  `,
})
export class ExampleComponent {}
```

The design tokens are imported once globally in `src/styles.css`; no extra setup needed.

## Design tokens

`lib/tokens/tokens.css` defines every color, surface, radius, focus ring and transition as a
`var(--ui-*)` custom property (light on `:root`, dark under `.my-app-dark`).

**Rules for page/components:** never hardcode hex/rgba in component styles — reference tokens
(e.g. `var(--ui-surface)`, `var(--ui-primary-grad)`, `var(--ui-focus-ring)`). If a value is
missing, add it to `tokens.css` instead of inlining it.

The `.ui-field` global utility class styles native `<input>`, `<select>` and `<textarea>`
(same recipe as the `ui-input` component) — use it when a page needs to style a native field
directly (e.g. icon-inside-input layouts).

## Components

| Component            | Selector        | Description                                                                                                                                                                                                                                 |
| -------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ButtonComponent`    | `ui-button`     | Variants: `primary`, `secondary`, `success`, `info`, `danger`, `ghost`, `icon`. Sizes: `xs`, `sm`, `md`, `lg`. `full` (boolean) makes it full-width. `loading` shows an inline spinner.                                                     |
| `CardComponent`      | `ui-card`       | **Dense card template** (profile-page design): glass surface, `0.875rem` radius, `overflow: hidden`, `flex:1` body. Optional `title`/`subtitle` header, `[uiCardIcon]` and `[uiCardActions]` slots, `padded` (default `true`).              |
| `BadgeComponent`     | `ui-badge`      | Variants: `neutral`, `success`, `warning`, `danger`, `info`, `pink`, `admin`, `rule`. Exposes `data-variant` on the host.                                                                                                                   |
| `InputComponent`     | `ui-input`      | `ControlValueAccessor` (works with `[(ngModel)]`). `type`, `placeholder`, `maxlength`, `disabled`, `invalid`, `ariaLabel`.                                                                                                                  |
| `FormFieldComponent` | `ui-form-field` | Label/hint/error wrapper around a field.                                                                                                                                                                                                    |
| `ProgressComponent`  | `ui-progress`   | `value`/`max` (default 100), `size` `sm`/`md`. Green fill at 100%.                                                                                                                                                                          |
| `SpinnerComponent`   | `ui-spinner`    | Sizes `xs`/`sm`/`md`/`lg` or any number (px); variants `accent` (default) / `light`.                                                                                                                                                        |
| `DialogComponent`    | `ui-dialog`     | `[(open)]` model, `appearance` `glass`/`solid`, `title`, `closeOnBackdrop`, `closeOnEscape`, `maxWidth`. Backdrop click, Escape, body scroll-lock, `close` output (emitted only on user-initiated close), optional `[uiDialogFooter]` slot. |

## Adding a component

1. Create `lib/<name>/<name>.component.ts` (standalone, `ChangeDetectionStrategy.Eager`, signal inputs).
   Add a short `/** ... */` JSDoc description directly above `@Component` and keep each
   input/output declaration on a single line — both are parsed by the registry generator.
2. Export it from `src/public-api.ts`.
3. Add it to this README's table.
4. (Optional, recommended) Create `lib/<name>/<name>.demo.ts` exporting `demos: UiDemoEntry[]`
   (see `lib/registry.ts`) with small interactive example components. Demos appear on the
   `/ui` preview page automatically.

`registry.generated.ts` is regenerated from the sources before every build/serve
(`tools/generate-ui-registry.mjs`, wired via npm pre-hooks) and drives the `/ui` preview
page. Do not edit it manually.

The library is consumed as source via the `@app/ui` path alias in `tsconfig.json`
(`./projects/ui/src/public-api.ts`) — it is bundled and tree-shaken with the app, so no
separate `ng build ui` step is needed during development.

## Preview page

The app ships a live component library preview at `/ui` (route `ui-preview`). It lists every
exported component with selector, description, inputs/outputs table and all demos found in
the package. No page code needs to change when the library grows.
