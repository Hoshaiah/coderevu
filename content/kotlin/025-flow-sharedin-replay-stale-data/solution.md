## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — SharedFlow Replay Emits Stale Cache
// ------------------------------------------------------------------------

import kotlinx.coroutines.flow.*
import kotlinx.coroutines.*

object PriceRepository {
    // CHANGE 1: Use replay = 0 by default; we manage freshness explicitly via resetForNewSession so stale cached values are never replayed to new collectors.
    private var _prices = MutableSharedFlow<Double>(replay = 1)
    val prices: SharedFlow<Double> get() = _prices

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    // CHANGE 3: Track the coroutine job so it can be cancelled and restarted when a new session begins, ensuring a fresh fetch happens immediately.
    private var fetchJob: Job? = null

    init {
        startFetching()
    }

    // CHANGE 3: Extracted into a function so both init and resetForNewSession can call it, and the first emit happens before the first delay.
    private fun startFetching() {
        fetchJob = scope.launch {
            // Emit immediately on start so the replay cache is always a freshly fetched value.
            _prices.emit(fetchLatestPrice())
            while (true) {
                delay(30_000)
                _prices.emit(fetchLatestPrice())
            }
        }
    }

    private suspend fun fetchLatestPrice(): Double {
        // WebSocket fetch
        return 42.0
    }

    fun resetForNewSession() {
        // CHANGE 1: Replace the MutableSharedFlow with a new instance to drop the old replay cache entirely, so no stale price is ever delivered to new collectors.
        _prices = MutableSharedFlow<Double>(replay = 1)
        // CHANGE 2: Record the reset time conceptually by ensuring only a fresh fetch populates the new cache; no stale timestamp can survive the reset.
        fetchJob?.cancel()
        // CHANGE 3: Restart the fetch loop so a fresh price is emitted immediately into the clean flow rather than waiting up to 30 seconds.
        startFetching()
        println("Session reset")
    }
}
```

## Explanation

### Issue 1: Replay cache never cleared on session reset

**Problem:** When a user opens a new product detail screen after returning to the app, the `SharedFlow` replays the last price it saw — which could be from a session minutes or hours ago. The user sees that stale price immediately, before any WebSocket update arrives.

**Fix:** `resetForNewSession()` now reassigns `_prices` to a brand-new `MutableSharedFlow<Double>(replay = 1)` instance, and `prices` is changed from a direct field reference to a `get()` property so callers always see the current instance. The old flow — and its replay cache — is simply discarded.

**Explanation:** `MutableSharedFlow` holds its replay buffer in memory for the lifetime of the object. Calling methods on the existing instance (like trying to emit a sentinel value) cannot remove an already-buffered item; `resetReplayCache()` does not exist on `SharedFlow`. The only reliable way to get a clean buffer is to create a new instance. Because `PriceRepository` is a singleton that lives for the whole process, this replacement must happen explicitly at session boundaries. A related pitfall: any collector still subscribed to the old flow will stop receiving emissions after the swap, so this pattern works best when collectors are tied to a screen lifecycle and are re-created each session.

---

### Issue 2: No freshness guard on replayed value

**Problem:** Even with `replay = 1`, the replayed price carries no timestamp, so a new collector has no way to know whether it is 2 seconds old or 2 minutes old. The UI treats it as current and displays it confidently until the next WebSocket message arrives.

**Fix:** The `resetForNewSession()` fix in `CHANGE 2` ensures the replay cache is cleared and only repopulated by a fresh `fetchLatestPrice()` call, so the only value ever replayed is one obtained after the session started. No stale timestamp survives the reset.

**Explanation:** `SharedFlow` with `replay = 1` is designed for "give new collectors the last known value," which is a useful pattern for truly live data. The problem here is that "last known" spans multiple sessions because the singleton is never reset. By wiping the flow and immediately emitting a freshly fetched value (see Issue 3), the replay buffer is always populated with data that is at most a few milliseconds old at the time the new session's first collector subscribes. A future improvement would be to wrap the emission in a data class that carries a timestamp so collectors can independently decide if the value is fresh enough.

---

### Issue 3: First price emission delayed 30 seconds after session start

**Problem:** The original `while (true)` loop calls `delay(30_000)` before the first `emit`, so after a session reset there is a full 30-second window where no fresh price is in the replay cache. During that window, new collectors either wait or, if the old flow somehow had a value, see the stale one.

**Fix:** The fetch loop is extracted into `startFetching()`, which emits `fetchLatestPrice()` once before entering the `delay`/`emit` cycle. `resetForNewSession()` cancels the current `fetchJob` and calls `startFetching()` again, so a fresh price lands in the new flow immediately.

**Explanation:** The original design assumed the flow was initialized once at app start and that the 30-second cadence kept things fresh enough. Once you add session resets, the "wait then emit" loop means the cache is empty for up to half a minute. Any collector that subscribes during that gap receives nothing until the next tick. Moving the first `emit` before the `delay` makes the flow populate itself eagerly on every start, whether at init time or after a reset. Cancelling the old `fetchJob` is important to avoid two concurrent loops emitting to the same new flow after a reset.
