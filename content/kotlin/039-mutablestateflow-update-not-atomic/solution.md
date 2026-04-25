## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — StateFlow update Race on Increment
// ------------------------------------------------------------------------

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class CartViewModel : ViewModel() {

    private val _itemCount = MutableStateFlow(0)
    val itemCount: StateFlow<Int> = _itemCount

    fun addItem(quantity: Int = 1) {
        viewModelScope.launch {
            // CHANGE 1: use update{} instead of a manual read-then-write so the increment is applied atomically via a compare-and-set loop, preventing lost updates when two coroutines race.
            _itemCount.update { current -> current + quantity }
        }
    }

    fun syncFromServer(serverCount: Int) {
        viewModelScope.launch(Dispatchers.IO) {
            // ... some IO work
            // CHANGE 2: use update{} here too so the read and the conditional write are a single atomic compare-and-set, eliminating the race with addItem that could cause the server count to overwrite a concurrently incremented local value.
            _itemCount.update { current -> maxOf(current, serverCount) }
        }
    }
}
```

## Explanation

### Issue 1: Non-atomic read-modify-write loses increments

**Problem:** The cart badge occasionally shows a lower count than expected after rapid taps or concurrent updates. Some increments just disappear, even though every call to `addItem` appears to read and write the value.

**Fix:** Replace `val current = _itemCount.value; _itemCount.value = current + quantity` with a single call to `_itemCount.update { current -> current + quantity }` (CHANGE 1). The same replacement is applied in `syncFromServer` (CHANGE 2).

**Explanation:** `MutableStateFlow.value` is a plain property backed by `@Volatile`. Reading it and then writing it are two separate operations with no lock between them. If coroutine A reads `value = 2` and coroutine B also reads `value = 2` before either writes back, A writes `3` and B also writes `3`, silently discarding one increment. The `update {}` extension function uses an atomic compare-and-set loop: it reads the current value, runs your lambda, then atomically swaps the new value in only if the stored value has not changed since the read. If another writer raced and changed the value first, `update` retries with the new current value, so no increment is lost. The fix is minimal — only the assignment sites change.

---

### Issue 2: Cross-dispatcher race between addItem and syncFromServer

**Problem:** `addItem` runs on the main dispatcher and `syncFromServer` runs on `Dispatchers.IO`. Both do a read-then-write on `_itemCount`. Even with `@Volatile` guaranteeing visibility, the window between the read and the write in each function lets the other coroutine sneak in and overwrite. Concretely, a background sync can reset the count to a stale server value right after the user tapped "add item".

**Fix:** `syncFromServer` also switches from the manual `val current = _itemCount.value; _itemCount.value = maxOf(current, serverCount)` pattern to `_itemCount.update { current -> maxOf(current, serverCount) }` (CHANGE 2).

**Explanation:** The problem is not just within one dispatcher — it spans two. `Dispatchers.IO` has a thread pool, and the main dispatcher has its own thread, so both can be executing simultaneously. `@Volatile` ensures each thread sees the latest written value, but it does not prevent interleaving: thread A reads 5, thread B reads 5 and increments to 6, thread A then overwrites 6 with `maxOf(5, serverCount)` which may be 5, rolling the count back. Using `update {}` on both call sites means each site independently retries its lambda whenever a concurrent writer changes the value first, so the final stored value reflects all concurrent changes regardless of which dispatcher is running the code.
