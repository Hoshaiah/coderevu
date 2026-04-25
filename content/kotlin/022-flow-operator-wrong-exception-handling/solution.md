## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Flow catch Misses Upstream Exceptions
// ------------------------------------------------------------------------

import kotlinx.coroutines.flow.*

data class Price(val amount: Double, val currency: String)

class PriceRepository(
    private val api: PricingApi,
    private val cache: PriceCache
) {
    fun livePrice(productId: String): Flow<Price> =
        flow {
            val price = api.fetchPrice(productId)
            emit(price)
        }
        .map { price -> price.copy(amount = price.amount * 1.1) }
        // CHANGE 1: moved onEach to before catch so that any exception it throws is also caught by the catch block; previously onEach sat downstream of catch and its exceptions bypassed recovery entirely.
        .onEach { price ->
            // CHANGE 2: replaced throw with a no-op log/ignore so that a non-positive price does not re-crash the flow after catch has already recovered; throwing here made the cached-price fallback impossible to observe.
            if (price.amount <= 0) {
                // In production, log the anomaly instead of throwing; the cached price may legitimately arrive here.
                println("Warning: non-positive price ${price.amount}, skipping throw to allow recovery")
            }
        }
        .catch { e ->
            val cached = cache.getPrice(productId)
            if (cached != null) emit(cached)
            else throw e
        }
}

interface PricingApi { suspend fun fetchPrice(id: String): Price }
interface PriceCache { fun getPrice(id: String): Price? }
```

## Explanation

### Issue 1: `catch` does not cover downstream operators

**Problem:** During chaos tests the app crashes with an unhandled exception even though a `catch` block is present. The `catch` block never executes because the exception is thrown from `onEach`, which sits *after* `catch` in the pipeline.

**Fix:** Move the `onEach` call to appear *before* `catch` in the chain (see `CHANGE 1`). In the fixed code the order is `flow { … } → map → onEach → catch`.

**Explanation:** In Kotlin's `Flow`, `catch` only intercepts exceptions emitted by the operators *upstream* of it — that is, operators that appear earlier in the call chain. Any operator placed after `catch` is downstream; exceptions from those operators propagate directly to the collector with no interception. In the buggy code, `onEach` is the last operator before `collect`, so its `IllegalStateException` travels to the `ViewModel` uncaught. Moving `onEach` upstream of `catch` puts its exceptions inside the zone that `catch` monitors, so the fallback to the cached price can execute. A related pitfall: `catch` also does not cover exceptions thrown inside the terminal `collect { … }` lambda — those always propagate to the caller.

---

### Issue 2: `onEach` throws after `catch` emits the cached fallback

**Problem:** Even after fixing the operator order, a non-positive cached price would hit the `throw IllegalStateException` inside `onEach` and crash the flow again, defeating the recovery logic. The symptom is a crash immediately after `cache.getPrice` returns a price with `amount <= 0`.

**Fix:** Replace the `throw` inside `onEach` with a non-fatal action such as logging (see `CHANGE 2`). The check is kept so the anomaly is visible, but the flow is allowed to continue or complete normally.

**Explanation:** `catch` can `emit` values to continue the flow after an error, but those emitted values still pass through any upstream `onEach` that sits before `catch`. If that `onEach` throws, the new exception propagates downstream past `catch` (because `catch` has already run and does not re-intercept its own emitted items). The cached price may validly have `amount <= 0` in some states (for example, a free promotional item), so throwing unconditionally is both fragile and incorrect. Converting the throw to a warning log keeps the anomaly observable without terminating the flow or discarding the fallback price the user should see.
