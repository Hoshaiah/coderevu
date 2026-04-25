## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Flow Emit on Wrong Dispatcher
// ------------------------------------------------------------------------

import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.Dispatchers

class SensorRepository(private val sensorApi: SensorApi) {

    // Intended to produce sensor readings on a background thread
    fun sensorReadings(): Flow<Float> = callbackFlow {
        val listener = object : SensorApi.Listener {
            override fun onReading(value: Float) {
                // The hardware callback arrives on an arbitrary thread
                // CHANGE 1: replaced `withContext(Dispatchers.IO) { trySend(value) }` with a direct `trySend(value)` call — `onReading` is not a suspend function so `withContext` cannot be called here; `trySend` is thread-safe and correct to call directly from any thread.
                trySend(value)
            }
        }
        sensorApi.register(listener)
        awaitClose { sensorApi.unregister(listener) }
    // CHANGE 2: kept `flowOn(Dispatchers.IO)` but added a comment clarifying it controls the coroutine context for the callbackFlow block itself (e.g. registration), NOT the thread the hardware callback fires on — the team must not rely on flowOn to sanitize callback threads; trySend handles cross-thread emission safely.
    }.flowOn(Dispatchers.IO)
}
```

## Explanation

### Issue 1: `withContext` called in non-suspend callback

**Problem:** The `onReading` method on `SensorApi.Listener` is a plain Java/Kotlin interface method, not a suspend function. Calling `withContext(Dispatchers.IO) { ... }` inside it is a compile error because `withContext` is a suspend function and can only be invoked from a coroutine or another suspend function. Even if the compiler accepted it (e.g. via an IDE workaround or a different API shape), the intent — switching to `Dispatchers.IO` before sending — is wrong because `trySend` is already thread-safe.

**Fix:** Remove the `withContext` wrapper entirely. Replace it with a direct `trySend(value)` call at the CHANGE 1 site. `trySend` is designed to be called from any thread and does not require a coroutine context.

**Explanation:** `callbackFlow` creates a `SendChannel` whose `trySend` method is explicitly documented as thread-safe. Hardware sensor APIs fire callbacks on their own internal threads, which is fine — `trySend` can accept the value from that thread and hand it off to the coroutine that is collecting the flow. Adding `withContext` does not help here; it just introduces an illegal suspend call in a non-suspend context. The crash (`CalledFromWrongThreadException`) happens because the broken `withContext` usage either fails to compile cleanly or silently falls through, letting the emission reach the UI thread check in a confused state. Removing `withContext` and trusting `trySend` is the correct pattern for bridging callback APIs into `callbackFlow`.

---

### Issue 2: `flowOn` misunderstood as controlling callback thread

**Problem:** The team believed that adding `flowOn(Dispatchers.IO)` to the flow would ensure all emissions arrive on `Dispatchers.IO`, preventing the `CalledFromWrongThreadException`. In practice, `flowOn` only changes the `CoroutineContext` for the upstream coroutine block (the lambda passed to `callbackFlow`), not the thread on which the hardware sensor API fires its callbacks. So sensor readings can still arrive on any arbitrary thread.

**Fix:** At the CHANGE 2 site, `flowOn(Dispatchers.IO)` is retained because it correctly scopes the coroutine that runs the `callbackFlow` block (e.g. the `sensorApi.register` call and `awaitClose` teardown), but a clarifying comment is added so future maintainers understand what it does and does not guarantee.

**Explanation:** `flowOn` changes the dispatcher for code that executes inside the flow builder coroutine itself. It has no power over external threads — the sensor hardware API schedules `onReading` callbacks wherever it wants, completely outside coroutine control. Relying on `flowOn` to guarantee callback dispatch is a common misunderstanding. The safe design is to accept that `onReading` fires on an unknown thread and use `trySend` (thread-safe by contract) to hand the value into the flow. If strict dispatcher enforcement on the emission side were needed, a `Channel` with an explicit dispatcher wrapping the send would be required, but for `callbackFlow` `trySend` is sufficient.
