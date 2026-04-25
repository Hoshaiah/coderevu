---
slug: coroutine-launch-exception-swallowed-supervisorjob
track: kotlin
orderIndex: 24
title: SupervisorJob Swallows Child Exceptions
difficulty: medium
tags:
  - coroutines
  - exception-handling
  - android
language: kotlin
---

## Context

This is a `ViewModel` in an Android app that fetches user profile data and updates a UI state. The team recently switched the `viewModelScope`-style manual scope to a custom `CoroutineScope` using `SupervisorJob` so that a failure in one child coroutine wouldn't cancel the others. The scope is defined in a base class shared across several features.

In production, the app silently shows a perpetual loading spinner when the network call fails. The catch block in `loadProfile` is never reached, and no error is logged. Crashlytics shows nothing. QA can reproduce it every time the API returns a 500, but no exception is ever surfaced to the UI.

The team verified that `exceptionHandler` is wired correctly by testing it in a standalone unit test with `runBlocking` — it seemed to fire there. The bug only appears when launching from the custom scope in the ViewModel.

## Buggy code

```kotlin
import kotlinx.coroutines.*

val exceptionHandler = CoroutineExceptionHandler { _, throwable ->
    println("Caught: ${throwable.message}")
}

class ProfileViewModel {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    val uiState = mutableListOf<String>()

    fun loadProfile(userId: String) {
        scope.launch {
            try {
                val result = fetchProfile(userId)
                uiState.add(result)
            } catch (e: Exception) {
                uiState.add("Error: ${e.message}")
            }
        }
    }

    private suspend fun fetchProfile(userId: String): String {
        delay(100)
        throw RuntimeException("Network error")
    }

    fun clear() {
        scope.cancel()
    }
}
```
