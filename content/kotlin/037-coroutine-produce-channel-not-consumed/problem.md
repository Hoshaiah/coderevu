---
slug: coroutine-produce-channel-not-consumed
track: kotlin
orderIndex: 37
title: produce Channel Hangs on Send
difficulty: hard
tags:
  - coroutines
  - channels
  - correctness
language: kotlin
---

## Context

This pipeline stage lives in `etl/RecordProducer.kt` and uses the `produce` coroutine builder to emit database records into a channel for downstream processing. The producer is intended to be short-lived: it reads all records, sends them to the channel, and completes. The downstream consumer is a separate coroutine that processes records and writes results to another system.

In production, the ETL job sometimes hangs indefinitely. The producer goroutine never completes, thread dumps show it is suspended on a channel `send`, and the downstream consumer is no longer running because it threw an exception and was not restarted. The job has to be killed manually, causing the next scheduled run to fail the idempotency check.

The team added a timeout to the overall job but it only partially helped — the job is now killed on time, but the root cause (consumer exception leaving the producer stuck forever) is not addressed. The producer has no way to detect that its consumer is gone.

## Buggy code

```kotlin
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.*

data class Record(val id: Int, val payload: String)

class RecordProducer(private val scope: CoroutineScope) {

    fun produceRecords(): ReceiveChannel<Record> = scope.produce {
        val records = fetchAllRecords()
        for (record in records) {
            send(record)  // BUG: hangs forever if consumer dies
        }
    }

    suspend fun runPipeline() {
        val channel = produceRecords()
        // Consumer coroutine — if this throws, the channel is never fully consumed
        scope.launch {
            for (record in channel) {
                processRecord(record)  // may throw
            }
        }
        // Producer is orphaned if consumer exits early due to exception
    }

    private suspend fun fetchAllRecords(): List<Record> {
        delay(10)
        return List(100) { Record(it, "payload-$it") }
    }

    private suspend fun processRecord(record: Record) {
        if (record.id == 50) throw RuntimeException("Processing failed at record 50")
        delay(1)
    }
}
```
