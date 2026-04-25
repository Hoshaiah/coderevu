## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Class Instance Spread Drops Methods
// ------------------------------------------------------------------------

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
      // CHANGE 1: Reconstruct a real User instance instead of spreading into a plain object literal, so the prototype chain (and fullName()) is preserved.
      user: new User(
        patch.id ?? state.user!.id,
        patch.firstName ?? state.user!.firstName,
        patch.lastName ?? state.user!.lastName,
        patch.email ?? state.user!.email
      ),
    })),
}));

export { User, useUserStore };
```

## Explanation

### Issue 1: Spread Drops Class Prototype Methods

**Problem:** After `updateUser` is called, any code that calls `user.fullName()` crashes with `user.fullName is not a function`. The initial login works because the auth module constructs a real `User` instance; the update path silently replaces it with a plain object.

**Fix:** Replace the object spread `{ ...state.user!, ...patch } as User` with an explicit `new User(...)` call, picking each field from `patch` if present or falling back to the existing `state.user` value with the `??` operator.

**Explanation:** In JavaScript, class methods live on `User.prototype`, not on individual instances. When you write `{ ...state.user!, ...patch }`, the spread operator copies only own enumerable properties (`id`, `firstName`, etc.) into a brand-new plain object `{}`. That plain object has `Object.prototype` as its prototype, not `User.prototype`, so `fullName` does not exist on it. Constructing with `new User(...)` ensures the resulting object's prototype chain includes `User.prototype` and all its methods. A related pitfall: adding methods directly to the instance (`this.fullName = () => ...`) inside the constructor would survive a spread, but that wastes memory and breaks inheritance — the proper fix is to always reconstruct via `new`.

---

### Issue 2: `as User` Cast Hides the Runtime Bug at Compile Time

**Problem:** TypeScript emits no error on `{ ...state.user!, ...patch } as User` even though the result is a plain object with no prototype methods. Developers see a green build and assume the type is correct, so the bug reaches production undetected.

**Fix:** Removing the `as User` cast is a side effect of the `new User(...)` reconstruction — the expression already returns a `User`, so no cast is needed and none appears in the reference solution.

**Explanation:** TypeScript uses structural typing: any object that has the right property shapes satisfies a type, regardless of its runtime prototype. Because a plain object with `id`, `firstName`, `lastName`, and `email` fields matches the shape of `User`, the cast `as User` is accepted without complaint. TypeScript does not track whether methods are present on the prototype vs. the instance, so the missing `fullName` is invisible to the type checker. Using `new User(...)` directly means the returned type is inferred as `User` by the compiler and is genuinely a `User` at runtime, closing the gap between the static type and the runtime value.
