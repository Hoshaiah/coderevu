---
slug: coroutine-scope-job-cancels-siblings
track: kotlin
orderIndex: 21
title: Job Cancellation Kills Sibling Coroutines
difficulty: medium
tags:
  - coroutines
  - structured-concurrency
  - cancellation
language: kotlin
---

## Context

This is a background data-sync worker in `SyncManager.kt`. It launches several independent coroutines to sync different data sources — contacts, calendar, and files — and waits for all of them to finish. The function is called from a `ViewModel` using `viewModelScope`.

In production, operators notice that whenever the contacts sync fails with an exception, the calendar and file syncs are silently aborted mid-run. The overall sync reports as failed even when only one source had a transient error, and partial syncs leave data inconsistent.

The team added try/catch blocks inside each launched coroutine expecting to isolate failures, but the problem persists. The issue is not in the individual sync implementations — each is well-tested in isolation.

## Buggy code

```kotlin
import kotlinx.coroutines.*

class SyncManager {
    suspend fun syncAll() {
        val scope = CoroutineScope(Job())
        val contactsJob = scope.launch {
            try {
                syncContacts()
            } catch (e: Exception) {
                println("Contacts sync failed: ${e.message}")
            }
        }
        val calendarJob = scope.launch {
            syncCalendar()
        }
        val filesJob = scope.launch {
            syncFiles()
        }
        joinAll(contactsJob, calendarJob, filesJob)
    }

    private suspend fun syncContacts() { throw RuntimeException("Network error") }
    private suspend fun syncCalendar() { delay(1000) }
    private suspend fun syncFiles() { delay(500) }
}
```
