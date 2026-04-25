---
slug: mutex-unlock-missing-finally
track: kotlin
orderIndex: 20
title: Mutex Unlock Skipped on Exception
difficulty: medium
tags:
  - coroutines
  - concurrency
  - resource-management
language: kotlin
---

## Context

`InventoryManager.kt` coordinates concurrent stock updates in an e-commerce backend. It uses a `kotlinx.coroutines.sync.Mutex` to guard a critical section that reads, validates, and writes inventory counts. The mutex is locked before the critical section and unlocked afterward.

Under load testing, the inventory service permanently hangs after an occasional stock validation throws an `IllegalStateException` (e.g., when the requested quantity exceeds available stock). All subsequent requests queue up waiting for the mutex and never make progress. A service restart is required to recover.

The team verified the exception is caught by the caller and handled correctly — the customer sees an appropriate error. The hang affects all subsequent requests, not just the failing one.

## Buggy code

```kotlin
import kotlinx.coroutines.sync.Mutex

data class StockUpdate(val productId: String, val delta: Int)

class InventoryManager {
    private val mutex = Mutex()
    private val stock = mutableMapOf<String, Int>()

    suspend fun applyUpdate(update: StockUpdate) {
        mutex.lock()
        val current = stock[update.productId] ?: 0
        if (current + update.delta < 0) {
            throw IllegalStateException("Insufficient stock for ${update.productId}")
        }
        stock[update.productId] = current + update.delta
        mutex.unlock()
    }
}
```
