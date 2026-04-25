## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — conflate Drops Intermediate Progress Updates
// ------------------------------------------------------------------------

import kotlinx.coroutines.flow.*

class UploadViewModel : ViewModel() {

    // CHANGE 1: Replaced MutableSharedFlow (no buffer, conflate() is a no-op on it) with MutableStateFlow so conflation is real — StateFlow always holds the latest value and the collector sees whatever the most recent emission was; the final 100 is never lost because StateFlow keeps it as its current state until collected.
    private val _progress = MutableStateFlow(0)
    // CHANGE 2: Removed .conflate() call — MutableStateFlow already has conflation semantics built in (it keeps only the latest value), so the extra conflate() operator is redundant and misleading.
    val progress: StateFlow<Int> = _progress.asStateFlow()

    fun startUpload(fileBytes: ByteArray) {
        viewModelScope.launch {
            for (percent in 0..100) {
                _progress.value = percent
                delay(20)
            }
        }
    }
}
```

## Explanation

### Issue 1: conflate() Is a No-Op on MutableSharedFlow

**Problem:** The progress bar skips intermediate values — jumping from 0% to 100% — or stalls at a mid-point value because updates are silently dropped. The UI never smoothly animates through the full range even though the producer emits every integer.

**Fix:** Replace `MutableSharedFlow` with `MutableStateFlow(0)` (CHANGE 1) and remove the `.conflate()` call (CHANGE 2). Assign the exposed property type as `StateFlow<Int>` via `.asStateFlow()`.

**Explanation:** `conflate()` is a Flow operator that works by skipping buffered intermediate values when the downstream collector is slow. For it to have any effect, the flow must actually buffer values so that conflation can drop the stale ones. `MutableSharedFlow` with default parameters has `extraBufferCapacity = 0`, so `emit()` suspends until the collector is ready to receive — there is never anything in the buffer to conflate. The result is that the collector receives values at the pace it can process them, but once it falls behind under load, the `emit()` calls start racing against each other and the collector misses values that were never buffered in the first place. `MutableStateFlow` has true conflation semantics by design: assigning `.value` always stores the latest integer immediately without suspending, and the collector always sees the most recent value when it resumes. A related pitfall: if you still need a `SharedFlow` with real conflation, you must set `extraBufferCapacity > 0` and then apply `.conflate()`; without the buffer there is nothing to conflate.

---

### Issue 2: Final Value Can Be Lost with Zero-Buffer SharedFlow

**Problem:** The upload completes but the progress bar is stuck at 45% (or some other mid-value). The `emit(100)` call fires, but the UI never shows 100% complete.

**Fix:** `MutableStateFlow` (CHANGE 1) stores its current value persistently. A collector that subscribes after the final `_progress.value = 100` assignment still reads `100` immediately because `StateFlow` replays the latest value to new collectors and holds it until overwritten.

**Explanation:** `MutableSharedFlow` with `replay = 0` (the default) does not retain any value. If the collector is busy processing the previous emission when `emit(100)` is called and the flow has no buffer, the `emit` either suspends waiting for the collector or, under certain scheduling conditions on a loaded device, the coroutine completes before the collector drains the last value. `MutableStateFlow` solves this because `.value = 100` is a non-suspending property assignment that immediately updates the state; the collector will see `100` on its next collection cycle regardless of when that happens. The progress bar will show 100% as long as the UI is still active — even if collection happens after the producer coroutine has already finished.
