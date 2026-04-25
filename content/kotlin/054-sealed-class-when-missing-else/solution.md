## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Exhaustive when Without else Compiles
// ------------------------------------------------------------------------

sealed class PaymentState {
    object Pending : PaymentState()
    data class Success(val txId: String) : PaymentState()
    data class Failed(val reason: String) : PaymentState()
}

class PaymentProcessor {

    // Called from Java: PaymentProcessor pp = new PaymentProcessor();
    // pp.handleState(null);  <-- Java callers can pass null
    // CHANGE 1: Parameter type changed to nullable PaymentState? so the Kotlin type system acknowledges that Java can pass null, making the null case visible to the compiler and forcing us to handle it.
    fun handleState(state: PaymentState?): String {
        // CHANGE 2: Added an explicit null check as the first branch so null is handled and returns a safe fallback instead of hitting the when dispatch and throwing an NPE.
        if (state == null) return "error: null state"
        return when (state) {
            is PaymentState.Pending  -> "pending"
            is PaymentState.Success  -> "ok: ${state.txId}"
            is PaymentState.Failed   -> "err: ${state.reason}"
        }
    }
}
```

## Explanation

### Issue 1: Non-null Parameter Accepts Null from Java

**Problem:** The parameter `state: PaymentState` has a non-null Kotlin type, but Java ignores Kotlin's nullability annotations. When a Java caller passes `null`, the JVM happily crosses the language boundary and `state` arrives as `null` at runtime despite the type declaration. Crashlytics reports `'result' must not be null` because Kotlin's internal null-check intrinsic fires before the `when` even executes.

**Fix:** Change the parameter type from `PaymentState` to `PaymentState?` at the `fun handleState` declaration (CHANGE 1). This makes the nullability explicit in the Kotlin type system, forces the compiler to track it, and lets you write a handler for it.

**Explanation:** Kotlin emits a hidden `Intrinsics.checkNotNullParameter` call at the start of every non-null parameter function. When Java passes `null`, this intrinsic throws `NullPointerException` with the message `'state' must not be null` before any of your own code runs. Changing to `PaymentState?` removes that intrinsic and shifts the responsibility for null handling into your code. This is the boundary problem between Kotlin and Java interop: Kotlin's type safety holds within Kotlin but cannot prevent Java from ignoring annotations. Any `fun` callable from Java that takes a reference type should be written with `?` if Java callers are not guaranteed to pass non-null values.

---

### Issue 2: No Branch Handles the Null Case

**Problem:** Even after accepting `PaymentState?`, the `when` expression only covers `Pending`, `Success`, and `Failed`. If `null` reaches the `when`, none of the `is` branches match, and the expression has no `else`, so at runtime Kotlin throws a `NoWhenBranchMatchedException`. The callers in production get an unhandled exception rather than a degraded-but-safe response.

**Fix:** Add `if (state == null) return "error: null state"` immediately before the `when` expression (CHANGE 2). This exits the function early with a safe string when `state` is null, so the `when` block only ever sees a non-null `PaymentState` and the exhaustiveness check remains intact without an `else`.

**Explanation:** A `when` on a nullable type that omits `null ->` and `else` is not exhaustive. Even if the sealed class covers every subclass, `null` is not a subclass — it is a separate possible value of a nullable type. The early `if (state == null) return` guard is idiomatic in Kotlin for exactly this interop scenario: it narrows the type from `PaymentState?` to `PaymentState` for everything below it, which means the compiler still enforces that the `when` covers all sealed subclasses and would still fail to compile if you added a new subclass without a branch. The intentional design of omitting `else` for exhaustiveness is preserved.
