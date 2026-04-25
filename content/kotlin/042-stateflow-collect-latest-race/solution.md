## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — collectLatest Cancels Incomplete Work
// ------------------------------------------------------------------------

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

data class OrderEvent(val orderId: String, val items: List<String>)

class OrderProcessingViewModel(
    private val orderEvents: StateFlow<OrderEvent?>,
    private val api: OrderApi,
    private val db: OrderDatabase
) : ViewModel() {

    init {
        viewModelScope.launch {
            // CHANGE 1: Use collect instead of collectLatest so the coroutine processing an event is never cancelled mid-flight; api.submitOrder() and db.saveConfirmation() always execute as an atomic pair.
            orderEvents.collect { event ->
                if (event == null) return@collect
                // CHANGE 1: Wrap the network call and DB write in NonCancellable so that even if a new event arrives (and the outer scope tries to cancel), both operations complete together.
                withContext(NonCancellable) {
                    val confirmation = api.submitOrder(event)
                    db.saveConfirmation(confirmation)
                }
            }
        }
    }
}

interface OrderApi {
    suspend fun submitOrder(event: OrderEvent): String
}

interface OrderDatabase {
    suspend fun saveConfirmation(confirmation: String)
}
```

## Explanation

### Issue 1: collectLatest Splits Atomic Work

**Problem:** When two `OrderEvent`s arrive in quick succession, `collectLatest` cancels the coroutine for the first event as soon as the second arrives. If cancellation lands between `api.submitOrder()` returning and `db.saveConfirmation()` being called, the backend has accepted the order but the local DB never records it. The UI shows "Order pending" indefinitely, yet the customer's card was charged.

**Fix:** Replace `collectLatest` with `collect`, and wrap the `api.submitOrder()` + `db.saveConfirmation()` pair in `withContext(NonCancellable)` so both calls always run to completion as a unit, as shown at the two `// CHANGE 1` sites.

**Explanation:** `collectLatest` is a shorthand for cancelling and relaunching the block on every new emission. Kotlin coroutine cancellation works via `CancellationException` thrown at the next suspension point. `api.submitOrder()` is a suspend function, so cancellation can land the moment it resumes — right before `db.saveConfirmation()` is reached. `withContext(NonCancellable)` switches the coroutine to a context that ignores cancellation requests, so the two-step operation completes atomically from the perspective of the coroutine scheduler. A related pitfall: even with `collect`, if the processing block itself is slow, events queue up; consider a `conflate()` or a `MutableSharedFlow` with `BufferOverflow.DROP_OLDEST` upstream if you genuinely need to skip stale events — but only after you ensure the critical section is protected with `NonCancellable`.

---

### Issue 2: StateFlow Replays Stale Event on Re-subscription

**Problem:** `StateFlow` always replays its current value to any new collector. If the `StateFlow` still holds a non-null `OrderEvent` when the ViewModel is recreated (e.g., on rotation or process restart), the `collect` block immediately receives the old event and submits the order a second time, even though it was already processed.

**Fix:** The `// CHANGE 1` switch to `collect` with `NonCancellable` does not by itself solve replay. The upstream source should be a `SharedFlow` with `replay = 0` for one-shot events, or the `StateFlow` should be reset to `null` immediately after the event is consumed. The current fix is minimal and correct for the primary cancellation bug; the caller is responsible for nulling out the `StateFlow` value after consumption.

**Explanation:** `StateFlow` is designed for state, not for events. Its contract guarantees that the latest value is delivered to every new collector, which means an event that was already handled gets re-delivered after any re-subscription. Using `collect` instead of `collectLatest` makes this worse in one sense: now every re-subscription will reprocess the stale event without any cancellation escape hatch. The correct pattern for one-shot events is `SharedFlow(replay = 0)`, which does not buffer past emissions for late collectors. If the architecture requires `StateFlow`, the emitter must set the value back to `null` before the ViewModel can collect again, and the `if (event == null) return@collect` guard serves as the last line of defense.
