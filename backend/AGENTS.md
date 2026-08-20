# Backend Guidelines (`backend/`)

Cloudflare Worker API built with TypeScript, Drizzle ORM + D1 (SQLite), KV, and Durable Objects (`PlayerlistStorage`). Entrypoint: `src/index.ts`.

## Coding Conventions

> [!IMPORTANT]
> All backend code must adhere to the conventions defined in [`CONVENTIONS.md`](file:///home/bet/Projects/zeitvertreib-website/backend/CONVENTIONS.md).
> Key rules include: no object destructuring, no raw SQL (use Drizzle ORM), mandatory `proxyFetch()` for external HTTP calls, runtime validation via `typia`, and route registration in `src/index.ts`.

## Dev & Commands

- **Local Dev**: `npm start` (runs `tsc --watch` and `wrangler dev` in parallel on `:8787`, `FRONTEND_URL` set to `localhost:4200`).
- **Build**: `npm run build` (`rimraf dist && tsc`). Requires `ts-patch` installed (`npm run prepare`) for `typia` transformations. Do not remove `typia` from `tsconfig.json`.
- **Database Init**: `npm run db:init` pushes schema to local D1 (`drizzle.config.ts` locates local SQLite under `.wrangler/` after `wrangler dev`).

## Environment & Types

- **Wrangler Bindings**: Configured in `wrangler.jsonc` per environment (`local`/`dev`/`production`). Secrets live in `.env` (see `.env.example`).
- **Types**: `worker-configuration.d.ts` is generated via `npx wrangler types` and committed; regenerate when bindings change.

## Database & Schema

- Schema definition: `src/db/schema.ts`; SQL migrations: `drizzle/migrations`.
- CI builds against pulled production schema (swapping `drizzle/schema.ts`), so committed schema and migrations must remain in sync.
