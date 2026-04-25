---
slug: spread-loses-class-instance-methods
track: javascript
orderIndex: 32
title: Class Instance Spread Drops Methods
difficulty: easy
tags:
  - types
  - correctness
  - classes
language: typescript
---

## Context

This code lives in `src/store/userStore.ts`, a Zustand store managing the currently authenticated user. The `User` class has a helper method `fullName()` used throughout the UI. The store is initialized from a JWT payload and updated after profile edits.

After a profile edit, the UI crashes with `user.fullName is not a function`. The crash only occurs on the update path — the initial login works fine because the store is seeded with a real `User` instance constructed in the auth module.

The team checked that the `PATCH /profile` API returns the right data and that the store update is being called. The TypeScript compiler emits no errors because the spread is typed as `User`.

## Buggy code

```typescript
class User {
  constructor(
    public id: string,
    public firstName: string,
    public lastName: string,
    public email: string
  ) {}

  fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}

interface UserStore {
  user: User | null;
  updateUser: (patch: Partial<User>) => void;
}

const useUserStore = create<UserStore>((set) => ({
  user: null,
  updateUser: (patch) =>
    set((state) => ({
      user: { ...state.user!, ...patch } as User,
    })),
}));

export { User, useUserStore };
```
