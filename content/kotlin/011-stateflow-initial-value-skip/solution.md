## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — StateFlow Collector Misses First Emission
// ------------------------------------------------------------------------

import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.Lifecycle
import kotlinx.coroutines.launch

class LoginFragment : Fragment() {

    private val viewModel: LoginViewModel by viewModels()

    // CHANGE 1: Moved collection from onStart to onViewCreated so the single launch is tied to the view's lifecycle and is not re-launched on every onStart, preventing coroutine leaks and duplicate collectors.
    override fun onViewCreated(view: android.view.View, savedInstanceState: android.os.Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        lifecycleScope.launch {
            // CHANGE 2: Wrapped collect in repeatOnLifecycle(STARTED) so the collector is active only while the fragment is at least STARTED; this prevents StateFlow's conflation from discarding Loading while the fragment is briefly below STARTED on slow devices.
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.uiState.collect { state ->
                    renderState(state)
                }
            }
        }
    }

    private fun renderState(state: LoginUiState) { /* ... */ }
}
```

## Explanation

### Issue 1: Collector re-launched every onStart

**Problem:** Every time the fragment goes through `onStop` and back to `onStart` (e.g., screen-off/on, back-stack pop), `onStart` runs again and `lifecycleScope.launch` spawns a brand-new collector without cancelling the previous one. The fragment ends up with multiple active collectors, each calling `renderState` for every emission, which can cause redundant UI updates and unpredictable state.

**Fix:** The `launch` block is moved from `onStart` into `onViewCreated`. `lifecycleScope` is still used, but `onViewCreated` is called once per view creation, so only one coroutine is ever started per view instance.

**Explanation:** `lifecycleScope` cancels all its children when the fragment's lifecycle reaches `DESTROYED`, but it does not cancel children when the lifecycle dips below `STARTED`. That means a coroutine launched in `onStart` survives `onStop` and is still alive when `onStart` fires again. Moving the launch to `onViewCreated` means the coroutine is created exactly once per view. The `repeatOnLifecycle` block inside it (Issue 2's fix) handles the start/stop duty cycle safely from that single coroutine.

---

### Issue 2: StateFlow emission conflated while collector is backgrounded

**Problem:** Without `repeatOnLifecycle`, the `collect` call runs continuously even when the fragment is not visible. `StateFlow` only keeps the most recent value. On a slow device, `Loading` is emitted and immediately followed by `Success` before the main thread processes either; the collector, which is still technically running but competing with heavy UI work, reads only the latest value — `Success` — and never sees `Loading`. The spinner never appears.

**Fix:** `collect` is wrapped in `repeatOnLifecycle(Lifecycle.State.STARTED)`. This cancels the inner collector when the fragment drops below `STARTED` and relaunches it when the fragment returns to `STARTED`, so the collector always starts fresh from the current `StateFlow` value at the moment the UI becomes visible.

**Explanation:** `StateFlow` conflates: if two values are emitted before the collector suspends to process the first, the intermediate value is lost and only the latest is delivered. Without `repeatOnLifecycle`, when the fragment is briefly paused or the main thread is busy (common on low-end devices), the collector may be suspended at `collect`'s internal rendezvous point during the exact window between `Loading` and `Success`. Because `StateFlow` holds only one value, `Loading` is overwritten by `Success` before the collector resumes, so `renderState(Loading)` is never called. `repeatOnLifecycle` does not fix conflation itself, but it ensures the collector is only active when the UI is visible and the main thread is ready, dramatically narrowing that window. A related pitfall: if you need to guarantee every intermediate state is seen (no skips at all), switch to a `SharedFlow` with `replay=0` or a `Channel`-backed event stream for one-shot UI events like navigation.
