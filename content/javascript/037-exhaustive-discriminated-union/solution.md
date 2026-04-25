## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Non-Exhaustive Discriminated Union Switch
// ------------------------------------------------------------------------

type Notification =
  | { type: "like"; postId: string; fromUser: string }
  | { type: "comment"; postId: string; fromUser: string; preview: string }
  | { type: "follow"; fromUser: string }
  | { type: "mention"; postId: string; fromUser: string; context: string };

function renderNotification(n: Notification): string {
  switch (n.type) {
    case "like":
      return `${n.fromUser} liked your post.`;
    case "comment":
      return `${n.fromUser} commented: "${n.preview}"`;
    case "follow":
      return `${n.fromUser} started following you.`;
    // CHANGE 1: Added the missing 'mention' case so mention notifications render a real message instead of undefined.
    case "mention":
      return `${n.fromUser} mentioned you in a post: "${n.context}"`;
    // CHANGE 2: Added a default branch that assigns n to never, making TypeScript error if any union member is unhandled in the future.
    default:
      const _exhaustiveCheck: never = n;
      throw new Error(`Unhandled notification type: ${(_exhaustiveCheck as any).type}`);
  }
}
```

## Explanation

### Issue 1: Missing 'mention' Switch Case

**Problem:** When a `Notification` with `type: "mention"` is passed to `renderNotification`, no `case` matches, so the `switch` falls through without executing a `return`. Because the function has a declared return type of `string` but actually returns `undefined` at runtime, the UI renders the word `undefined` literally in the notification centre.

**Fix:** Add `case "mention":` returning a formatted string that uses `n.fromUser` and `n.context` — the two fields that carry the relevant information for this notification type.

**Explanation:** TypeScript checks that all code paths return a value, but a `switch` with no `default` and no `case` for every union member is not treated as a type error by default — TypeScript does not enforce exhaustiveness unless you add an explicit check. So the compiler accepted the function as returning `string` even though the `mention` branch was absent. At runtime, JavaScript `switch` statements that match no `case` and have no `default` fall out of the block entirely, and the function implicitly returns `undefined`. The declared return type `string` does not prevent this at runtime. Adding the `case "mention":` branch is the direct fix.

---

### Issue 2: No Exhaustiveness Check Allows Silent Future Regressions

**Problem:** Even with the `mention` case added, nothing stops the same bug from recurring when the next notification type is added to the union. TypeScript will not emit an error for a non-exhaustive `switch` unless the code explicitly encodes an exhaustiveness assertion.

**Fix:** Add a `default` branch that assigns `n` to a `const _exhaustiveCheck: never` variable. If `n` can ever reach that branch — meaning a union member has no matching `case` — TypeScript raises a type error at compile time because `n` would not be assignable to `never`.

**Explanation:** TypeScript's `never` type represents a value that can never exist. After all union members are handled in the `case` branches above the `default`, TypeScript narrows `n` to `never`. Assigning `n` to a variable typed as `never` is valid only when `n` really is `never`. The moment a new union variant like `{ type: "reaction" }` is added and no matching `case` is written, TypeScript infers that `n` inside `default` is `{ type: "reaction"; ... }`, which is not assignable to `never`, and the build fails. This converts a silent runtime bug into a compile-time error. The `throw` on the next line also acts as a runtime safety net in case the check is somehow bypassed, for example by untyped JavaScript callers passing an unexpected object.
