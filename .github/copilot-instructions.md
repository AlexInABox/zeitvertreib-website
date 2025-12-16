---
applyTo: "**"
---

## Architecture Overview

**Monorepo Structure**: Three main workspaces + shared types
- `backend/` - Cloudflare Workers API (TypeScript)
- `frontend/` - Angular 18+ SPA
- `overwatch/` - Discord moderation bot (Node.js)
- `types/` - Shared TypeScript definitions (consumed by all packages via `@zeitvertreib/types`)

**Backend Stack**: Cloudflare Workers + Drizzle ORM + D1 (SQLite) + KV (sessions/cache) + Durable Objects (playerlist)

## Critical Developer Workflows

### Building & Testing
```bash
# Backend: Always run this to test changes
cd backend && npm run build

# Types: Must rebuild after changes (used as local file: dependency)
cd types && npm run build

# Frontend: Always run this to test changes
cd frontend && npm run build
```
### No Destructuring!
```typescript
// ✅ CORRECT: Always use the full object
const foo = zoo();

// ❌ WRONG: Destructuring (forbidden)
const { bar, baz } = zoo();
```
### No raw SQL queries!
```typescript
// ✅ CORRECT: Always use Drizzle ORM methods
const users = await db.select().from(usersTable).where(eq(usersTable.id, userId));

// ✅ CORRECT: Drizzle ORM with prepared statements
const stmt = db.select().from(usersTable).where(eq(usersTable.id, placeholder("userId"))).prepare();
const users = await stmt.execute({ userId });

// ❌ WRONG: Raw SQL queries via D1 (NEVER USE)
const users = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(userId).run();

// ❌ WRONG: Raw SQL via env.ZEITVERTREIB_DATA (NEVER USE)  
const users = await env.ZEITVERTREIB_DATA.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
```

**IMPORTANT**: Always import and use the Drizzle database instance and schema, never directly access `env.ZEITVERTREIB_DATA` or write raw SQL queries.

### Discord Communication
- Discord communication **must always use `proxyFetch()` as a drop-in replacement for `fetch()`** to circumvent false positives from Discord's IP-based rate limits.

### Route Registration
- Backend routes **must always be registered in `src/routes/index.ts`** to ensure proper inclusion in the Cloudflare Worker build.

### dist/ Directories
- The `dist/` directories in each package are build outputs and **must not be committed to version control** or manually edited.