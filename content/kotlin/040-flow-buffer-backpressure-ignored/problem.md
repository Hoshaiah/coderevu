---
slug: flow-buffer-backpressure-ignored
track: kotlin
orderIndex: 40
title: Flow Buffer Drops Emissions Silently
difficulty: hard
tags:
  - coroutines
  - flow
  - backpressure
language: kotlin
---

## Context

This pipeline is in `SensorPipeline.kt` and processes a high-frequency stream of IoT sensor readings. Readings arrive via a `SharedFlow` and are processed through a `buffer` operator before being written to a time-series database. The operator was added to decouple the fast producer (sensor events at ~500 Hz) from the slow consumer (DB writes averaging 50ms each).

Ops reports that the time-series DB is missing roughly 80% of expected data points during peak load. The producer metrics show events are being emitted at the correct rate. CPU and memory look healthy. The loss only manifests when the consumer falls behind, which happens within seconds of startup.

The team added logging inside the `buffer` collector and confirmed that many emissions are never reaching the `collect` lambda. They checked for cancellation — none detected. The `SharedFlow` replay and `extraBufferCapacity` are configured correctly upstream.

## Buggy code

```kotlin
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

data class SensorReading(val sensorId: String, val value: Double, val timestamp: Long)

class SensorPipeline(
    private val readings: SharedFlow<SensorReading>,
    private val scope: CoroutineScope
) {
    fun start() {
        scope.launch {
            readings
                .buffer(capacity = 64, onBufferOverflow = BufferOverflow.DROP_OLDEST)
                .collect { reading ->
                    writeToDatabase(reading)
                }
        }
    }

    private suspend fun writeToDatabase(reading: SensorReading) {
        delay(20) // simulates DB write latency
        println("Written: ${reading.sensorId} @ ${reading.timestamp}")
    }
}
```
