---
slug: coroutine-exception-handler-ignored
track: kotlin
orderIndex: 28
title: CoroutineExceptionHandler on async Ignored
difficulty: hard
tags:
  - coroutines
  - error-handling
  - exceptions
language: kotlin
---

## Context

This is in `payment/PaymentProcessor.kt`. The processor uses `async` to run two parallel validation checks, wrapping the scope with a `CoroutineExceptionHandler` to catch failures and log them without crashing the app. The team believed the handler would catch exceptions from either deferred.

The app crashes with an unhandled exception in production when either validation step throws. The `CoroutineExceptionHandler` callback is never invoked. The team has verified the handler is installed correctly as a context element and works for `launch`-based coroutines elsewhere in the codebase.

## Buggy code

```kotlin
import kotlinx.coroutines.*

class PaymentProcessor {

    private val handler = CoroutineExceptionHandler { _, throwable ->
        println("Payment validation error: $throwable")
    }

    suspend fun validatePayment(cardNumber: String, amount: Double): Boolean {
        return try {
            coroutineScope {
                val cardCheck = async(handler) { checkCard(cardNumber) }
                val fraudCheck = async(handler) { checkFraud(cardNumber, amount) }
                cardCheck.await() && fraudCheck.await()
            }
        } catch (e: Exception) {
            false
        }
    }

    private suspend fun checkCard(cardNumber: String): Boolean = TODO()
    private suspend fun checkFraud(card: String, amount: Double): Boolean = TODO()
}
```
