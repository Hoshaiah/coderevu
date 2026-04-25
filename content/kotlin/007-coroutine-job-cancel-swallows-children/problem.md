---
slug: coroutine-job-cancel-swallows-children
track: kotlin
orderIndex: 7
title: Cancelling Job Stops Child Coroutines
difficulty: easy
tags:
  - coroutines
  - structured-concurrency
  - cancellation
language: kotlin
---

## Context

This function lives in `WorkManager.kt`, an infrastructure class that kicks off a batch of parallel data-sync tasks. Each task is launched as a child coroutine under a shared `Job`. The manager is expected to cancel all work when a user logs out, but individual sync errors should not cancel the other tasks.

In staging, testers noticed that whenever any single sync task throws an exception, the remaining tasks silently stop mid-run. The logs show no error for the cancelled tasks — they just disappear. Support tickets mention partial syncs leaving the local DB in an inconsistent state.

The team already confirmed the exception is being thrown in exactly one child, and they added `try/catch` around each `launch` body — yet sibling cancellations still happen. The root cause is the choice of Job type, not the catch placement.

## Buggy code

```kotlin
import kotlinx.coroutines.*

class WorkManager(private val scope: CoroutineScope) {

    private val managerJob = Job()

    fun startSyncTasks(taskIds: List<String>) {
        for (id in taskIds) {
            scope.launch(managerJob) {
                try {
                    performSync(id)
                } catch (e: Exception) {
                    println("Sync failed for $id: ${e.message}")
                }
            }
        }
    }

    fun cancelAll() {
        managerJob.cancel()
    }

    private suspend fun performSync(id: String) {
        delay(100)
        if (id == "bad-id") throw RuntimeException("Sync error")
        println("Synced $id")
    }
}
```
