---
slug: coroutine-launch-in-init-block
track: kotlin
orderIndex: 4
title: Coroutine Launched in Init Block
difficulty: easy
tags:
  - coroutines
  - android
  - lifecycle
language: kotlin
---

## Context

This `ViewModel` lives in `com/example/app/ui/HomeViewModel.kt`. It is responsible for loading a user's feed on construction and exposing it via a `StateFlow`. The `init` block is used to kick off the fetch so the UI gets data as soon as the `ViewModel` is created.

In testing, every `HomeViewModelTest` that creates the `ViewModel` crashes with `java.lang.IllegalStateException: Module with the Main dispatcher had failed to initialize`. In production it sometimes silently fails to load any data when the screen is first shown, with no error logged.

The `viewModelScope` extension is imported from `androidx.lifecycle:lifecycle-viewmodel-ktx` and should be available. The issue is not with the repository — it's been verified to return data correctly when called from a properly-scoped coroutine.

## Buggy code

```kotlin
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class HomeViewModel(
    private val feedRepository: FeedRepository
) : ViewModel() {

    private val _feed = MutableStateFlow<List<FeedItem>>(emptyList())
    val feed: StateFlow<List<FeedItem>> = _feed

    init {
        GlobalScope.launch {
            try {
                _feed.value = feedRepository.loadFeed()
            } catch (e: Exception) {
                // silently ignored
            }
        }
    }
}
```
