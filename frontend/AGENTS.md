# Frontend Guidelines (`frontend/`)

Angular 22 Single Page Application (SPA) using the JULE design spec (no Tailwind CSS, no PrimeNG). Served as Cloudflare static assets. Entrypoint: `src/main.ts`, routing: `src/app/app.routes.ts`.

## Skill & Coding Conventions

> [!IMPORTANT]
> **Always load the `angular-developer` skill (`.agents/skills/angular-developer/`) before editing frontend code.**
> **Always load the `avoid-ai-writing` skill (`.agents/skills/avoid-ai-writing/`) before writing or editing user-facing copy** (UI text, landing/dashboard sections, empty states, error messages).
> Refer to [`CONVENTIONS.md`](file:///home/bet/Projects/zeitvertreib-website/frontend/CONVENTIONS.md) for frontend coding standards (Signals reactivity, JULE primitives, modern Angular control flow syntax, shared types).
> The page design spec is **JULE** — read [`JULE.md`](file:///home/bet/Projects/zeitvertreib-website/frontend/JULE.md) before styling any page (`src/styles/jule.css`).

## Dev & Commands

- **Local Dev**: `npm start` (`ng serve --configuration local`).
- **Builds**:
  - `npm run build` — Production build.
  - `npm run build:dev` — Development build.
  - `npm run build:local` — Local environment build.
