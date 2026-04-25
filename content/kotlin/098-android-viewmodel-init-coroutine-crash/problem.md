---
slug: android-viewmodel-init-coroutine-crash
track: kotlin
orderIndex: 98
title: ViewModel Init Coroutine Leaks on Error
difficulty: medium
tags:
  - android
  - coroutines
  - lifecycle
language: kotlin
---

## Context

This `ViewModel` lives in `DashboardViewModel.kt` and is responsible for loading dashboard statistics when the screen is first shown. The coroutine is launched from `init` using `viewModelScope` to pre-fetch data before the user interacts with the UI. The app targets Android SDK 30+ and uses the standard Jetpack lifecycle-viewmodel-ktx artifact.

Crash reports in the production dashboard (Firebase Crashlytics) show a `NullPointerException` inside `loadStats()` triggered during app startup. The stack trace points to the `init` block. The crash happens more frequently on low-end devices and in CI when tests instantiate the ViewModel directly without a proper `SavedStateHandle`.

The team noticed the crash happens even when the user immediately navigates away from the screen before the coroutine completes. They expected `viewModelScope` to cancel the coroutine on `onCleared`, but the exception is not being caught and is propagating to the uncaught exception handler.

## Buggy code

```kotlin
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

data class DashboardStats(val totalUsers: Int, val revenue: Double)

class DashboardViewModel(private val repository: StatsRepository) : ViewModel() {

    private val _stats = MutableStateFlow<DashboardStats?>(null)
    val stats: StateFlow<DashboardStats?> = _stats

    init {
        viewModelScope.launch {
            val result = repository.fetchStats()
            _stats.value = result
        }
    }
}

interface StatsRepository {
    suspend fun fetchStats(): DashboardStats
}
```
