# Backend Coding Conventions (`backend/`)

This document outlines coding conventions for the Cloudflare Workers API backend. All AI agents and human developers must follow these patterns.

> [!NOTE]
> Conventions are always open to discussion! If you believe a convention should be clarified, updated, or removed, please open a GitHub Issue for discussion.

---

## 1. No Object Destructuring

Always reference properties directly on their container object. Do not destructure objects.

### ✅ DO (Correct)

```typescript
const data = await resp.json();
const userId = data.userId;
const name = data.username;
```

### ❌ DON'T (Forbidden)

```typescript
// Destructuring is strictly forbidden
const { userId, username } = await resp.json();
```

---

## 2. No Raw SQL / Direct D1 Queries

Always import the Drizzle ORM instance (`db`) and table schemas from `src/db/schema.ts`. Never execute raw SQL queries via D1 or access `env.ZEITVERTREIB_DATA` directly.

### ✅ DO (Correct)

```typescript
import { db, users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const result = await db.select().from(users).where(eq(users.id, userId));
```

### ❌ DON'T (Forbidden)

```typescript
// Raw D1 access / SQL queries are strictly forbidden
const result = await env.ZEITVERTREIB_DATA.prepare('SELECT * FROM users WHERE id = ?').bind(userId).all();
```

---

## 3. Outbound HTTP via `proxyFetch()`

All outbound HTTP calls to external services (Discord, Steam, Kofi, etc.) **must** use `proxyFetch()` from `src/proxy.ts` instead of native `fetch()`. This routes requests through the CORS proxy to prevent rate-limiting false positives.

### ✅ DO (Correct)

```typescript
import { proxyFetch } from '../proxy.js';

const resp = await proxyFetch('https://discord.com/api/v10/users/@me', {
  headers: { Authorization: `Bearer ${token}` },
});
```

### ❌ DON'T (Forbidden)

```typescript
// Direct global fetch for external APIs is forbidden
const resp = await fetch('https://discord.com/api/v10/users/@me', {
  headers: { Authorization: `Bearer ${token}` },
});
```

---

## 4. Runtime Request Validation with `typia`

Use `typia.is<T>()` to validate incoming request payloads against shared types imported from `@zeitvertreib/types`. Never write manual property checks or use unchecked type assertions.

### ✅ DO (Correct)

```typescript
import typia from 'typia';
import type { UserUpdateRequest } from '@zeitvertreib/types';

const body = await request.json();
if (!typia.is<UserUpdateRequest>(body)) {
  return new Response('Invalid request payload', { status: 400 });
}
```

### ❌ DON'T (Forbidden)

```typescript
// Manual type checks or blind casting are forbidden
const body = (await request.json()) as UserUpdateRequest;
if (typeof body.name !== 'string') {
  return new Response('Invalid payload', { status: 400 });
}
```

---

## 5. Route Registration

Register all backend API route handlers inside `src/index.ts` (there is no `src/routes/index.ts`). Discord slash commands are registered in `src/discord/commands.ts`.

---

## 6. ZVC Balances via `src/db/zvc.ts`

ZVC (Zeitvertreib Coins) balances are stored in `playerdata.experience`. All balance reads and writes **must** go through the helpers in `src/db/zvc.ts` — never through ad-hoc queries.

Available helpers (all take the drizzle instance and a `{ id }` or `{ discordId }` user reference):

- `getZvc(db, user)` → `Promise<number | null>` (`null` = user has no `playerdata` row)
- `increaseZvc(db, user, amount)` → atomic increment
- `decreaseZvc(db, user, amount)` → atomic decrement
- `increaseZvcQuery(db, user, amount)` / `decreaseZvcQuery(db, user, amount)` → the same updates **without executing them**, for composing atomic multi-statement writes

For multi-statement writes, combine the `*Query` builders in `db.batch([...])`. Batches are atomic on D1 (all statements commit together or roll back).

> [!WARNING]
> **Never use `db.transaction()` with D1.** Cloudflare D1 rejects explicit `BEGIN`/`COMMIT`/`ROLLBACK` SQL, and the drizzle D1 driver implements `.transaction()` by issuing exactly those statements — every call fails with a disallowed-query error. `db.batch([...])` is the only atomic multi-write primitive on D1.

### ✅ DO (Correct)

```typescript
import { getZvc, decreaseZvcQuery } from '../db/zvc.js';

const balance = await getZvc(db, { id: userid });
if (balance === null) {
  return createResponse({ error: 'Player not found' }, 404, origin);
}

await db.batch([
  decreaseZvcQuery(db, { id: userid }, 100),
  db.update(sprays).set({ createdAt: now }).where(eq(sprays.id, sprayId)),
]);
```

### ❌ DON'T (Forbidden)

```typescript
// Direct experience reads/writes outside src/db/zvc.ts are forbidden
const result = await db.select({ experience: playerdata.experience }).from(playerdata).where(...);
await db.update(playerdata).set({ experience: balance - 100 }).where(...);
```

**Exceptions:** queries that select additional fields alongside `experience` (e.g. `username`) or that need `returning()`/conditional `gte` clauses may keep their custom query, but only when the ZVC helper cannot express it.
