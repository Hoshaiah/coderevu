---
slug: coroutine-scope-cancelled-early
track: kotlin
orderIndex: 17
title: CoroutineScope Cancelled Before Children Finish
difficulty: medium
tags:
  - coroutines
  - lifecycle
  - cancellation
language: kotlin
---

## Context

This code lives in `JobProcessor.kt`, a background worker that processes a batch of upload jobs. It creates its own `CoroutineScope` tied to a `SupervisorJob` and launches child coroutines for each job. The worker is invoked from a service layer that calls `process()` and expects all jobs to complete before the function returns.

In production, some jobs silently disappear — the database rows are never updated, no errors are logged, and the upload never happens. The symptom is intermittent and appears to depend on how long individual jobs take. Shorter jobs always complete; longer ones vanish without a trace.

The team added logging at the start and end of each child coroutine and confirmed that some coroutines log their start message but never log their completion. The scope itself is not being cancelled from the outside.

## Buggy code

```kotlin
import kotlinx.coroutines.*

class JobProcessor {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    suspend fun process(jobs: List<UploadJob>) {
        for (job in jobs) {
            scope.launch {
                processJob(job)
            }
        }
    }

    private suspend fun processJob(job: UploadJob) {
        delay(job.estimatedMs)
        job.markComplete()
    }
}

data class UploadJob(val id: Int, val estimatedMs: Long) {
    suspend fun markComplete() { /* DB update */ }
}
```
