---
slug: mutex-double-lock-same-coroutine
track: kotlin
orderIndex: 41
title: Mutex Lock Causes Coroutine Deadlock
difficulty: hard
tags:
  - coroutines
  - concurrency
  - deadlock
language: kotlin
---

## Context

`InventoryService.kt` manages stock levels for an e-commerce platform. A `Mutex` protects the inventory map against concurrent updates from multiple coroutines. A helper function `reserveStock` acquires the mutex, calls an internal validation function, and then updates the count. The code was reviewed and looked correct to two engineers who both noted the mutex usage.

The service hangs in production with 100% CPU on one core and all checkout requests timing out. Thread dumps show coroutines suspended on `mutex.lock()` with no one holding the lock — or so it appears. Restarting the service resolves the hang temporarily. It reproducibly occurs when the same product is checked out and validated simultaneously.

Engineers added logging before and after every `mutex.lock()` call and noticed that `lock()` is sometimes called twice from within the same coroutine execution path without a corresponding `unlock()` between them.

## Buggy code

```kotlin
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class InventoryService {
    private val mutex = Mutex()
    private val stock = mutableMapOf<String, Int>()

    suspend fun reserveStock(productId: String, quantity: Int): Boolean {
        return mutex.withLock {
            if (isAvailable(productId, quantity)) {
                stock[productId] = (stock[productId] ?: 0) - quantity
                true
            } else {
                false
            }
        }
    }

    suspend fun isAvailable(productId: String, quantity: Int): Boolean {
        return mutex.withLock {
            (stock[productId] ?: 0) >= quantity
        }
    }

    suspend fun getStock(productId: String): Int {
        return mutex.withLock {
            stock[productId] ?: 0
        }
    }
}
```
