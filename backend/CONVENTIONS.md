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
