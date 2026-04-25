## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — SharedFlow Replay Causes Duplicate Processing
// ------------------------------------------------------------------------

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
    // CHANGE 1: replay changed from 1 to 0 — one-shot navigation events must not be replayed to late collectors; replay = 1 caused the event to re-fire on every new subscription (e.g., after screen rotation or Compose recomposition).
    private val _events = MutableSharedFlow<CheckoutEvent>(replay = 0)
    val events: SharedFlow<CheckoutEvent> = _events

    fun purchase() {
        viewModelScope.launch {
            // ... perform purchase ...
            // CHANGE 2: tryEmit is replaced with emit inside the coroutine; this is unchanged, but we explicitly rely on the fact that with replay = 0 the event is only delivered to currently-active collectors and is never cached for future ones.
            _events.emit(CheckoutEvent.NavigateToConfirmation)
        }
    }
}
```

## Explanation

### Issue 1: `replay = 1` Re-delivers One-Shot Events

**Problem:** After a successful purchase, rotating the device or briefly backgrounding the app causes the UI to navigate to the confirmation screen a second time. The user ends up on a screen with no back-stack entry to return from, even though the purchase only happened once.

**Fix:** Change `MutableSharedFlow<CheckoutEvent>(replay = 1)` to `MutableSharedFlow<CheckoutEvent>(replay = 0)` at the `_events` declaration. This removes the replay cache entirely.

**Explanation:** `SharedFlow` with `replay = 1` keeps the last emitted value in a buffer and immediately delivers it to any new collector that subscribes after the emission. In Compose, the `collectAsState`/`LaunchedEffect` collector is cancelled and restarted on recomposition, rotation, or process re-entry — each restart creates a new collector. With `replay = 1`, that fresh collector instantly receives the cached `NavigateToConfirmation` event even though it was emitted and handled minutes earlier. Setting `replay = 0` means the flow holds no cache; a collector only sees events emitted while it is actively subscribed. The trade-off is that a collector which subscribes a few milliseconds after emission will miss it, but for navigation events that window is acceptable and far preferable to re-triggering side effects. If you need survivability across a brief gap, a `Channel`-backed approach (e.g., `receiveAsFlow()`) or a consumed-flag wrapper is a better fit.

---

### Issue 2: No Consumed-State Guard for the Cached Event

**Problem:** Even if `replay` were intentionally kept at 1 (to survive a narrow subscription gap), there is no way for the UI to tell the ViewModel "I already handled this event". Every new collector gets the full event and acts on it unconditionally.

**Fix:** The primary fix is `replay = 0` from Issue 1, which makes the cache moot. As a belt-and-suspenders measure, if `replay > 0` is ever re-introduced, pair it with an explicit `resetReplayCache()` call immediately after the collector processes the event, or wrap events in a `ConsumedEvent<T>` holder that is atomically marked consumed before any side effect runs.

**Explanation:** `SharedFlow` has no built-in "consume once" semantics — unlike `Channel`, it does not remove an item from its buffer when a subscriber reads it. Every subscriber, present and future (up to `replay` count), sees the same item. Without a consumed flag, the second collector (the restarted Compose effect after rotation) processes `NavigateToConfirmation` as if it were fresh. The fix of `replay = 0` sidesteps this entirely: there is nothing in the cache to consume. If you later need `replay = 1` for legitimate reasons, `resetReplayCache()` called inside the UI handler (via a ViewModel method) is the minimal change that clears the stale entry and prevents re-delivery.
