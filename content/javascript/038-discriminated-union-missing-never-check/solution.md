## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Unexhaustive Union Without Never Guard
// ------------------------------------------------------------------------

type AccountCreated = { kind: "account_created"; username: string };
type PasswordReset = { kind: "password_reset"; resetLink: string };
type OrderShipped = { kind: "order_shipped"; trackingNumber: string };
type PaymentFailed = { kind: "payment_failed"; amount: number; currency: string };

type Notification = AccountCreated | PasswordReset | OrderShipped | PaymentFailed;

// CHANGE 2: Add a helper that enforces exhaustiveness by asserting the argument is `never`; if any variant is unhandled the type of `n` will not narrow to `never` and TypeScript will emit a compile-time error.
function assertNever(x: never): never {
  throw new Error(`Unhandled notification kind: ${(x as { kind: string }).kind}`);
}

function renderNotification(n: Notification): string {
  switch (n.kind) {
    case "account_created":
      return `Welcome, ${n.username}! Your account is ready.`;
    case "password_reset":
      return `Reset your password: ${n.resetLink}`;
    case "order_shipped":
      return `Your order is on its way! Tracking: ${n.trackingNumber}`;
    // CHANGE 1: Handle the `payment_failed` variant that was added to the union but never rendered, preventing blank emails.
    case "payment_failed":
      return `Payment of ${n.amount} ${n.currency} failed. Please update your payment method.`;
    // CHANGE 2: Call assertNever in the default branch so TypeScript errors at compile time if a future variant is added without a matching case.
    default:
      return assertNever(n);
  }
}
```

## Explanation

### Issue 1: Missing `payment_failed` switch case

**Problem:** `renderNotification` has no `case "payment_failed"` branch. When the email service calls the function with a `PaymentFailed` notification, the switch falls through all cases and the function returns `undefined`. TypeScript infers the return type as `string | undefined` when there is no exhaustive guard, but the declared return type is `string`, so at runtime the caller receives `undefined` and the email body is blank.

**Fix:** Add `case "payment_failed": return ...` inside the switch, using the `n.amount` and `n.currency` fields already present on the `PaymentFailed` type to produce a meaningful message (CHANGE 1).

**Explanation:** The `Notification` union was extended with `PaymentFailed` six months ago. The switch statement was never updated to match. Because TypeScript only errors on a missing variant when there is an exhaustive check in place (see Issue 2), no compile error appeared. The function silently returned `undefined`. Callers typed the result as `string` and passed it directly to the email renderer, which serialised `undefined` as an empty string. Adding the case gives the variant a real code path and eliminates the silent `undefined` return for this input.

---

### Issue 2: No exhaustive-check (`never`) guard on the switch

**Problem:** Without a `default: assertNever(n)` branch, TypeScript has no way to tell the developer that the switch is incomplete. Any future variant added to `Notification` will compile silently and produce the same blank-email bug as Issue 1, repeating the problem indefinitely.

**Fix:** Add a top-level `assertNever` helper that declares its parameter as `never` and throws at runtime (CHANGE 2). Add a `default` branch in the switch that calls `assertNever(n)`. After all known variants are handled, TypeScript narrows `n` to `never`; if a variant is missing, `n` still has that variant's type and passing it to a `never` parameter is a compile-time type error.

**Explanation:** TypeScript's control-flow analysis narrows a union as each `case` is matched. Once every member of the union has a matching `case`, the type of `n` in the `default` branch is `never` — the empty type. `assertNever` accepts `never` and TypeScript is satisfied. If a new variant like `type OrderCancelled = { kind: "order_cancelled" }` is added to `Notification` without adding a matching `case`, the `default` branch sees `n` typed as `OrderCancelled`, not `never`. Passing that to `assertNever(x: never)` is a type error: `Argument of type 'OrderCancelled' is not assignable to parameter of type 'never'`. This turns a silent runtime regression into a build-time failure. A related pitfall: if `assertNever` is defined to return `void` instead of `never`, TypeScript will not use it to prove exhaustiveness and the check silently stops working.
