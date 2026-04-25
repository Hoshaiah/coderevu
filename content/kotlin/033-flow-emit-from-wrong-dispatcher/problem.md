---
slug: flow-emit-from-wrong-dispatcher
track: kotlin
orderIndex: 33
title: Flow Emit on Wrong Dispatcher
difficulty: hard
tags:
  - coroutines
  - android
  - collections
language: kotlin
---

## Context

This repository class lives in `com/example/data/SensorRepository.kt`. It wraps a callback-based hardware sensor API in a Kotlin `Flow` using `callbackFlow`. The flow is collected in a `ViewModel` and the results are posted to a `StateFlow` that updates the UI.

In production, the app occasionally crashes with `CalledFromWrongThreadException: Only the original thread that created a view hierarchy can touch its views`. Strangely, this happens even though the `ViewModel` always collects on `Dispatchers.Main`. The crash stack trace points to the `StateFlow.value` assignment inside the collect lambda.

The team already verified the ViewModel collection site uses `flowOn(Dispatchers.Main)` downstream, but the crash persists on some devices.

## Buggy code

```kotlin
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class SensorRepository(private val sensorApi: SensorApi) {

    // Intended to produce sensor readings on a background thread
    fun sensorReadings(): Flow<Float> = callbackFlow {
        val listener = object : SensorApi.Listener {
            override fun onReading(value: Float) {
                // The hardware callback arrives on an arbitrary thread
                withContext(Dispatchers.IO) {
                    trySend(value)
                }
            }
        }
        sensorApi.register(listener)
        awaitClose { sensorApi.unregister(listener) }
    }.flowOn(Dispatchers.IO)
}
```
