## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Flow Collected in Wrong Scope
// ------------------------------------------------------------------------

// FeedFragment.kt
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.Lifecycle
import kotlinx.coroutines.launch
import android.os.Bundle
import android.view.View

class FeedFragment : Fragment() {
    private val viewModel: FeedViewModel by viewModels()

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // CHANGE 1 & 2: Replace bare lifecycleScope.launch + collect with repeatOnLifecycle(STARTED) so the collector is automatically cancelled when the fragment goes to STOPPED (background/rotation) and restarted only when it returns to STARTED, preventing both the IllegalStateException from updating a destroyed view and the accumulation of duplicate active collectors across rotations.
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.feedItems.collect { items ->
                    adapter.submitList(items)
                }
            }
        }
    }
}
```

## Explanation

### Issue 1: Collector outlives view lifecycle

**Problem:** After a screen rotation, the Fragment's view is destroyed and recreated, but the coroutine launched with bare `lifecycleScope.launch` keeps collecting. When the flow emits a new value, the collector calls `adapter.submitList`, which touches the old, destroyed view, throwing `IllegalStateException`.

**Fix:** Replace `lifecycleScope.launch { viewModel.feedItems.collect { … } }` with `viewLifecycleOwner.lifecycleScope.launch { viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) { viewModel.feedItems.collect { … } } }`. The `repeatOnLifecycle` block cancels the inner coroutine when the lifecycle drops below `STARTED` and restarts it when it rises back to `STARTED`.

**Explanation:** `lifecycleScope` is tied to the Fragment's own lifecycle, not to its view's lifecycle. The view is destroyed during rotation before the Fragment itself is destroyed, so the coroutine stays alive and holds a reference to the old adapter/view. `viewLifecycleOwner.lifecycleScope` is scoped to the view's lifetime, and wrapping the collection in `repeatOnLifecycle(STARTED)` adds an inner suspension point that cancels the `collect` call the moment the lifecycle transitions to `STOPPED` (which happens as the activity goes to the background or the view is torn down during rotation). This is the standard safe pattern for collecting flows in fragments; using `STARTED` rather than `RESUMED` is intentional because it keeps the UI updated while the fragment is visible but paused.

---

### Issue 2: New collector launched per rotation causing duplicate upstream work

**Problem:** Every rotation calls `onViewCreated` again, and each call to `lifecycleScope.launch` starts a brand-new coroutine that independently collects from the same flow. If the flow triggers any upstream work (network requests, database queries), Charles Proxy logs show one extra call per rotation because each active collector triggers its own upstream subscription.

**Fix:** Switching to `viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED)` means the coroutine from a previous view lifecycle is cancelled when the view is destroyed, so only one collector is ever active at a time regardless of how many rotations have occurred.

**Explanation:** A `StateFlow` (or `SharedFlow` with `replay`) can drive upstream producers — for example, a `shareIn` or `stateIn` operator with `SharingStarted.WhileSubscribed` will start a new upstream coroutine for each new subscriber. With the buggy code, each rotation adds a collector without removing the previous one (because the old `lifecycleScope` isn't cancelled until the Fragment itself is destroyed). After two rotations there are three active collectors, and any `WhileSubscribed` upstream sees three subscribers, potentially triggering the network call three times. `repeatOnLifecycle` tears down the inner collector when the lifecycle goes below `STARTED`, so the subscriber count stays at most one, and `WhileSubscribed` upstream properly stops and restarts only once per lifecycle transition.
