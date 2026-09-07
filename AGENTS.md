# AGENTS.md

Monorepo for the Zeitvertreib SCP:SL server: web platform + SCP:SL plugins. See also `CHANGELOG.md` (user-facing changes only).

## Submodule Documentation & Conventions

- **Backend (`backend/`)**: See [`backend/AGENTS.md`](file:///home/bet/Projects/zeitvertreib-website/backend/AGENTS.md) for worker setup, Drizzle/D1, and router rules. Coding conventions are detailed in [`backend/CONVENTIONS.md`](file:///home/bet/Projects/zeitvertreib-website/backend/CONVENTIONS.md).
- **Frontend (`frontend/`)**: See [`frontend/AGENTS.md`](file:///home/bet/Projects/zeitvertreib-website/frontend/AGENTS.md) for Angular guidelines, skill requirements, and builds. Coding conventions are detailed in [`frontend/CONVENTIONS.md`](file:///home/bet/Projects/zeitvertreib-website/frontend/CONVENTIONS.md).

## Repo Layout

- `backend/` — Cloudflare Worker API (TypeScript). Drizzle ORM + D1 (SQLite), KV, Durable Objects. Entrypoint `src/index.ts`.
- `frontend/` — Angular 22 SPA (PrimeNG, no Tailwind). Entrypoint `src/main.ts`.
- `types/` — `@zeitvertreib/types` (`file:../types`). Consumed via direct `.ts` source. `npm run build` generates C# API bindings (`dist/csharp/Api.cs`, `dist/csharp/DiscordTracker.cs`).
- `overwatch/` — Discord moderation bot (Node, Docker image).
- `proxied/` — Express CORS proxy for Medal clips (Docker image).
- `documentation/` — Docusaurus site (user docs).
- `minecraft/` — Gradle Minecraft mod project (not in CI).
- Root `zeitvertreibplugins.sln` + PascalCase dirs — EXILED SCP:SL plugins in C# referencing `..\types\dist\csharp\Api.cs` via `Base.csproj`.

## C# Plugins Policy

- **NO MOSTLY AI-WRITTEN CODE IN C# PLUGINS.** The EXILED / SCP:SL framework and game logic are insufficiently indexed by LLMs, complex, fuzzy, and dangerously prone to hallucinations.
- **Humans must write all C# game logic.**
- AI is permitted only to review existing C# code for obvious logic errors, inconsistencies, and style.

## Writing Quality Policy

- **NO AI-SOUNDING PROSE IN USER-FACING COPY.** Load the `avoid-ai-writing` skill (`.agents/skills/avoid-ai-writing/`) before writing or editing any user-facing prose: UI copy, landing/dashboard text, `documentation/`, `CHANGELOG.md`, Discord bot messages.
- Audit the draft against the skill's pattern catalog (`references/patterns.md`) and rewrite until clean. Prose only — code, tables, and quoted material are exempt.

## Build Order

`types` must be built **before** frontend/backend/plugins:

1. `cd types && npm run build` — Typechecks TS source & regenerates C# bindings (`Api.cs`, `DiscordTracker.cs`).
2. `cd backend && npm run build` — Transpiles backend (`rimraf dist && tsc`) with `ts-patch` for typia transforms.
3. `cd frontend && npm run build` — Builds production Angular SPA (`build:dev` / `build:local` for other configs).
4. `cd overwatch && npm run build` — Clean reinstall & build (`npx tsc` for quick checks).

## Git & Release Workflow

- **Branching**: Base branch is `dev`; releases cut from `main`. CI auto-deploys: `dev` → dev.zeitvertreib.vip, `main` → zeitvertreib.vip.
- **Formatting**: Pushes to `dev` trigger a Prettier auto-format job (`npx prettier --write <file>`).
- **PRs**: Must follow Conventional Commits (`feat:`, `fix:`, etc.) and sign the CLA (`.github/cla.yml`).
- **Changelog**: Update `CHANGELOG.md` only for user-facing, gameplay-affecting changes (no technical details, dependency upgrades, or CI changes).
- **Releases**: `main` pushes build all plugins, tag `build-N` (monotonic integer), and publish DLLs to GitHub releases.
- **Ignored Artifacts**: Never commit `dist/`, `node_modules/`, `.env`, or `.wrangler/`.
