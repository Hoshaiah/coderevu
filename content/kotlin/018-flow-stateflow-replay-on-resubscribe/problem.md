---
slug: flow-stateflow-replay-on-resubscribe
track: kotlin
orderIndex: 18
title: SharedFlow Replay Causes Duplicate Processing
difficulty: medium
tags:
  - coroutines
  - flow
  - android
language: kotlin
---

## Context

`CheckoutViewModel.kt` exposes a `SharedFlow` of one-shot navigation events (e.g., navigate to confirmation screen). The `replay = 1` parameter is set so that a new collector that subscribes slightly after emission still receives the event — a common pattern to survive brief recompositions in Compose.

Users report being navigated to the confirmation screen twice on some devices — once when the purchase completes and again when they rotate the screen or put the app in the background and return. The order total is charged only once, but the double-navigation leaves them stranded on a screen with no back stack entry.

The team confirmed the ViewModel is not re-created on rotation (it's scoped to the Activity). The `SharedFlow` event is emitted exactly once. No duplicate network calls occur.

## Buggy code

```kotlin
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch

sealed class CheckoutEvent {
    object NavigateToConfirmation : CheckoutEvent()
    data class ShowError(val message: String) : CheckoutEvent()
}

class CheckoutViewModel : ViewModel() {
    private val _events = MutableSharedFlow<CheckoutEvent>(replay = 1)
    val events: SharedFlow<CheckoutEvent> = _events

    fun purchase() {
        viewModelScope.launch {
            // ... perform purchase ...
            _events.emit(CheckoutEvent.NavigateToConfirmation)
        }
    }
}
```
