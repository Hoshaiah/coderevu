---
slug: viewmodel-oncleared-not-called
track: kotlin
orderIndex: 92
title: CoroutineScope Leak in ViewModel
difficulty: medium
tags:
  - android
  - coroutines
  - lifecycle
language: kotlin
---

## Context

`SearchViewModel.kt` manages a search feature. The developer wanted fine-grained control over cancellation and created a custom `CoroutineScope` backed by a `SupervisorJob`. The ViewModel launches long-running search coroutines into this scope.

QA reported that after repeated navigation to and from the search screen, memory usage climbs steadily. Leak Canary flags `SearchViewModel` instances as leaking. The ViewModels are not being cleared from memory even after the fragment is destroyed.

The developer verified that the fragment itself is not holding a reference to the ViewModel. The leak trace always roots at the custom scope's `Job` holding a reference chain back to the ViewModel instance.

## Buggy code

```kotlin
import androidx.lifecycle.ViewModel
import kotlinx.coroutines.*

class SearchViewModel(private val repo: SearchRepository) : ViewModel() {

    private val job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.Main + job)

    fun search(query: String) {
        scope.launch {
            val results = repo.search(query)
            _results.value = results
        }
    }

    // onCleared() never overridden — job is never cancelled
}
```
