---
slug: typescript-generic-identity-loses-type
track: javascript
orderIndex: 44
title: Generic Constraint Widened to Unknown
difficulty: hard
tags:
  - types
  - typescript
  - generics
language: typescript
---

## Context

The file `src/utils/pick.ts` provides a utility used across the codebase to select a subset of keys from an object. It is used in API response transformers and in form-state reducers to strip sensitive or unnecessary fields before passing objects down the component tree.

Developers using `pick` have reported that TypeScript stops complaining when they accidentally pass a key that does not exist on the object, and that the return type of `pick` is always inferred as `{}` (empty object) rather than the correctly narrowed type. This causes downstream code that destructures the result to have all properties typed as `any` or produce silent `undefined` accesses at runtime.

The team upgraded from TypeScript 4.x to 5.x and hoped the issue would resolve itself, but it persisted. They've verified the tsconfig has `strict: true`.

## Buggy code

```typescript
// src/utils/pick.ts

/**
 * Returns a new object containing only the specified keys from `obj`.
 */
export function pick<T, K>(obj: T, keys: K[]): Pick<T, any> {
  const result: any = {};
  for (const key of keys) {
    result[key as any] = (obj as any)[key as any];
  }
  return result;
}

// Example usage (should type-check strictly):
interface User {
  id: number;
  name: string;
  passwordHash: string;
}

declare const user: User;

// This should be a type error ("score" is not a key of User)
// but TypeScript silently accepts it:
const safe = pick(user, ["id", "name", "score"]);
```
