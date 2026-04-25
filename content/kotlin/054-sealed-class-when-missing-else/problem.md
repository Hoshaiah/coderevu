---
slug: sealed-class-when-missing-else
track: kotlin
orderIndex: 54
title: Exhaustive when Without else Compiles
difficulty: medium
tags:
  - nullability
  - sealed-classes
  - correctness
language: kotlin
---

## Context

`PaymentProcessor.kt` uses a sealed class to represent payment states. A `when` expression routes each state to a handler. The team relies on the Kotlin compiler's exhaustiveness check to ensure all states are handled — they intentionally omit `else` so that adding a new subclass breaks the build.

After a library upgrade, a `NullPointerException` is thrown at the `when` expression in production. The sealed class has not changed. The NPE appears in Crashlytics with the message `'result' must not be null`, pointing to a line that accesses the return value of `handleState`.

The team is baffled because the `when` appears exhaustive and the compiler emits no warning.

## Buggy code

```kotlin
sealed class PaymentState {
    object Pending : PaymentState()
    data class Success(val txId: String) : PaymentState()
    data class Failed(val reason: String) : PaymentState()
}

class PaymentProcessor {

    // Called from Java: PaymentProcessor pp = new PaymentProcessor();
    // pp.handleState(null);  <-- Java callers can pass null
    fun handleState(state: PaymentState): String {
        return when (state) {
            is PaymentState.Pending  -> "pending"
            is PaymentState.Success  -> "ok: ${state.txId}"
            is PaymentState.Failed   -> "err: ${state.reason}"
        }
    }
}
```
