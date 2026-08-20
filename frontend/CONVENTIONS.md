# Frontend Coding Conventions (`frontend/`)

This document outlines coding conventions for the Angular 22 frontend application. All AI agents and human developers must follow these patterns.

> [!NOTE]
> Conventions are always open to discussion! If you believe a convention should be clarified, updated, or removed, please open a GitHub Issue for discussion.

---

## 1. Skill Requirement

Always load the `angular-developer` skill before editing frontend code:
`.agents/skills/angular-developer/SKILL.md`

---

## 2. PrimeNG & Custom CSS over Tailwind

Stop using PrimeNG components at all. PrimeNG will be removed from this codebase in the future. Use custom build CSS & compontents instead. Do not use Tailwind CSS.
We will implement our own ShadCN-style component library in the future.

---

## 3. Monorepo Shared Types

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
