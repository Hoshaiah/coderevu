## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Generic Constraint Widened to Unknown
// ------------------------------------------------------------------------

// src/utils/pick.ts

/**
 * Returns a new object containing only the specified keys from `obj`.
 */
// CHANGE 1: Constrain K to keyof T so TypeScript rejects keys that don't exist on T.
// CHANGE 2: Return Pick<T, K> instead of Pick<T, any> so the result type reflects only the picked keys.
export function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    result[key] = obj[key];
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

// Now correctly a type error: Argument of type 'string[]' is not assignable to
// parameter of type '("id" | "name" | "passwordHash")[]' because "score" is not a key of User.
// const safe = pick(user, ["id", "name", "score"]); // <-- TS error as expected

// Correct usage: return type is Pick<User, "id" | "name">, i.e. { id: number; name: string }
const safe = pick(user, ["id", "name"]);
```

## Explanation

### Issue 1: K Unconstrained, Accepts Any Key

**Problem:** Because `K` has no constraint in the original signature `pick<T, K>`, TypeScript widens `K` to `unknown`. Any string (or anything else) is accepted as a valid key, so passing `"score"` — a key that does not exist on `User` — produces no compiler error and silently results in `undefined` at runtime.

**Fix:** Add `extends keyof T` to the `K` type parameter: `pick<T, K extends keyof T>`. This tells TypeScript that every element of `keys` must be an actual key of `T`, and passing `"score"` when `T` is `User` becomes a compile-time error.

**Explanation:** TypeScript infers the type argument `K` from the array literal you pass. Without a constraint, inference succeeds for any string because `string` is assignable to unconstrained `K`. Adding `K extends keyof T` narrows the valid inferences to the union `"id" | "name" | "passwordHash"` for `User`. When TypeScript tries to infer `K` from `["id", "name", "score"]`, it finds `"score"` is not in `keyof User` and reports an error. A related pitfall: if you loosen the constraint to just `K extends string`, TypeScript stops checking against the actual keys of `T` and the problem returns.

---

### Issue 2: Return Type Is Pick<T, any>, Erasing Type Information

**Problem:** `Pick<T, any>` expands to an index signature that makes every property type `any`, so the return value of `pick` has no useful type information. Downstream code that destructures `const { id, name } = safe` sees both fields as `any` instead of `number` and `string`, defeating the purpose of TypeScript's structural typing.

**Fix:** Replace `Pick<T, any>` with `Pick<T, K>` in the return type annotation, and change `const result: any = {}` to `const result = {} as Pick<T, K>` so the intermediate variable carries the right type too.

**Explanation:** `Pick<T, K>` is a mapped type that produces `{ [P in K]: T[P] }`. When `K` is the literal union `"id" | "name"` and `T` is `User`, the result is `{ id: number; name: string }`. Using `any` as the key argument to `Pick` instead collapses this to an essentially untyped object because `any` satisfies every constraint and makes every mapped value `any`. Changing `result` from `any` to `Pick<T, K>` also eliminates the unsafe `key as any` casts inside the loop — the compiler now knows `key` is a valid index for both `obj` and `result`, so no casts are needed.
