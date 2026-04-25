---
slug: flow-sharedin-replay-stale-data
track: kotlin
orderIndex: 25
title: SharedFlow Replay Emits Stale Cache
difficulty: medium
tags:
  - coroutines
  - flow
  - android
language: kotlin
---

## Context

This repository class lives in `data/PriceRepository.kt` and exposes live price updates from a WebSocket connection as a `SharedFlow`. Multiple ViewModels collect from it. The `replay = 1` parameter was added so that new collectors immediately receive the most recent price without waiting for the next WebSocket message.

A newly opened product detail screen sometimes shows an outdated price for several seconds before updating. The stale price can be minutes old — from a previous browsing session — because the `SharedFlow` is declared as a top-level singleton and the replay cache persists for the entire app process lifetime. Users have reported seeing a price that has since changed significantly.

The team thought `replay = 1` was safe because the WebSocket sends updates every 30 seconds, but they didn't account for the fact that the singleton is never reset between browsing sessions, and the replayed value is whatever was last seen — potentially from a stale connection.

## Buggy code

```kotlin
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.*

object PriceRepository {
    private val _prices = MutableSharedFlow<Double>(replay = 1)
    val prices: SharedFlow<Double> = _prices

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    init {
        scope.launch {
            // Simulates WebSocket messages
            while (true) {
                delay(30_000)
                _prices.emit(fetchLatestPrice())
            }
        }
    }

    private suspend fun fetchLatestPrice(): Double {
        // WebSocket fetch
        return 42.0
    }

    fun resetForNewSession() {
        // Intended to clear stale state, but does nothing to the replay cache
        println("Session reset")
    }
}
```
