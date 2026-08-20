# Frontend Guidelines (`frontend/`)

Angular 22 Single Page Application (SPA) using PrimeNG 21 (no Tailwind CSS). Served as Cloudflare static assets. Entrypoint: `src/main.ts`, routing: `src/app/app.routes.ts`.

## Skill & Coding Conventions

> [!IMPORTANT]
> **Always load the `angular-developer` skill (`.agents/skills/angular-developer/`) before editing frontend code.**
> Refer to [`CONVENTIONS.md`](file:///home/bet/Projects/zeitvertreib-website/frontend/CONVENTIONS.md) for frontend coding standards (Signals reactivity, PrimeNG controls, modern Angular control flow syntax, shared types).

## Dev & Commands

- **Local Dev**: `npm start` (`ng serve --configuration local`).
- **Builds**:
  - `npm run build` — Production build.
  - `npm run build:dev` — Development build.
  - `npm run build:local` — Local environment build.
