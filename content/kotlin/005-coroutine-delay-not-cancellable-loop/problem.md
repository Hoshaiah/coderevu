---
slug: coroutine-delay-not-cancellable-loop
track: kotlin
orderIndex: 5
title: Blocking Sleep Inside Coroutine Loop
difficulty: easy
tags:
  - coroutines
  - cancellation
  - performance
language: kotlin
---

## Context

This background worker lives in `WorkerService.kt` and polls a remote API every few seconds to check for new jobs. It is launched as a long-running coroutine tied to the application's `CoroutineScope` and is expected to stop cleanly when the scope is cancelled (e.g. on app shutdown or the service being destroyed).

Operators report that the worker never actually stops when the service is torn down. The cancellation signal is sent, but the coroutine keeps running for an indeterminate amount of time — sometimes minutes — before the process finally exits. Memory and thread-pool metrics show the job is still alive long after the scope should have ended.

The developer checked that the scope itself is cancelled correctly (confirmed via logging), so the issue is inside the loop body itself.

## Buggy code

```kotlin
import kotlinx.coroutines.*

class JobPoller(private val scope: CoroutineScope) {

    fun start() {
        scope.launch {
            while (isActive) {
                try {
                    fetchAndProcessJobs()
                } catch (e: Exception) {
                    println("Error processing jobs: ${e.message}")
                }
                Thread.sleep(5_000)
            }
        }
    }

    private suspend fun fetchAndProcessJobs() {
        // ... network call and processing
        println("Jobs processed")
    }
}
```
