## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — An object literal in JSX props triggers an infinite render loop
// ------------------------------------------------------------------------
import { useEffect, useState, useMemo } from "react";

interface Options {
  includeAvatar: boolean;
}

function UserProfile({ userId, options }: { userId: string; options: Options }) {
  const [user, setUser] = useState(null);

  // CHANGE 2: Depend on the primitive value options.includeAvatar instead of the options object reference, so the effect only re-runs when the value changes.
  useEffect(() => {
    fetch(`/api/users/${userId}?avatar=${options.includeAvatar}`)
      .then((r) => r.json())
      .then(setUser);
  }, [userId, options.includeAvatar]);

  return <div>{user ? JSON.stringify(user) : "Loading..."}</div>;
}

// Parent component
export function App() {
  // CHANGE 1: Stabilise the options object with useMemo so its reference does not change on every render of App, preventing an infinite render loop.
  const options = useMemo(() => ({ includeAvatar: true }), []);
  return <UserProfile userId="42" options={options} />;
}
```

## Explanation

### Issue 1: Unstable object reference in JSX prop

**Problem:** Every time `App` renders it evaluates `{ includeAvatar: true }` as a fresh object literal. Even though the contents are identical, JavaScript object equality is by reference, so `options` is a brand-new value each render. `useEffect` sees a changed dependency and fires the fetch, which updates state, which re-renders `App`, which creates another new object, which triggers the effect again — forever. The browser tab freezes and DevTools shows an endless stream of network requests.

**Fix:** At the `CHANGE 1` site, the inline `{{ includeAvatar: true }}` is replaced with a `useMemo`-stabilised variable `const options = useMemo(() => ({ includeAvatar: true }), [])`. The empty dependency array means the memoised object is created exactly once, so its reference never changes between renders.

**Explanation:** React's `useEffect` compares each dependency using `Object.is`. Two separately created objects like `{ includeAvatar: true }` and `{ includeAvatar: true }` are not the same reference, so `Object.is` returns `false` every time. `useMemo` with an empty array allocates the object once and returns the same reference on subsequent renders, so `Object.is` returns `true` and the effect is not re-scheduled. A related pitfall: the same issue occurs with inline arrays and inline function expressions passed as props to components that use them in dependency arrays.

---

### Issue 2: Object used as effect dependency instead of its primitive field

**Problem:** Even if the parent one day passes a stabilised `options` reference, depending on the whole object inside `useEffect` is fragile. If any unrelated field is added to `Options` later, the effect will re-run even though `includeAvatar` — the only field the fetch actually uses — has not changed.

**Fix:** At the `CHANGE 2` site, `options` in the dependency array is replaced with `options.includeAvatar`. The effect body already only reads `options.includeAvatar`, so the dependency list now accurately reflects what the effect actually consumes.

**Explanation:** React's exhaustive-deps lint rule asks that every value read inside the effect is listed as a dependency. The effect reads `options.includeAvatar`, not `options` as a whole, so listing the primitive boolean is both correct and more precise. A boolean is compared with `Object.is` as a value, so it only triggers a re-run when the actual flag flips from `true` to `false` or vice versa. This also future-proofs the component: adding new fields to `Options` will not accidentally re-fetch user data.
