## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Observer Fired After Fragment Destroy
// ------------------------------------------------------------------------

import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import android.os.Bundle
import android.view.View

class SearchFragment : Fragment() {
    private var binding: SearchBinding? = null
    private val viewModel: SearchViewModel by viewModels()

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding = SearchBinding.bind(view)

        // CHANGE 1: Use viewLifecycleOwner instead of 'this' so the observer is removed when the view is destroyed, preventing delivery after binding is null.
        viewModel.results.observe(viewLifecycleOwner) { results ->
            // CHANGE 2: Replace binding!! with safe-call (?.) so a late delivery during teardown is silently ignored rather than throwing NullPointerException.
            binding?.recyclerView?.adapter = SearchAdapter(results)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        binding = null
    }
}
```

## Explanation

### Issue 1: Wrong lifecycle owner for LiveData observer

**Problem:** The observer is registered with `this` (the `Fragment` instance) as the lifecycle owner. The Fragment's lifecycle outlives its view — it stays `STARTED` even after `onDestroyView` runs. So when the user switches tabs rapidly and the view is torn down, a pending LiveData emission can still fire, finding `binding` already set to `null` and crashing with `NullPointerException`.

**Fix:** Replace `this` with `viewLifecycleOwner` in the `observe(...)` call. `viewLifecycleOwner` is tied to the view's own `Lifecycle`, which moves to `DESTROYED` during `onDestroyView`, causing LiveData to automatically remove the observer before `binding` is nulled.

**Explanation:** A `Fragment` and its view have separate lifecycles. The view lifecycle starts in `onCreateView`/`onViewCreated` and ends in `onDestroyView`; the fragment lifecycle starts in `onCreate` and ends in `onDestroy`. When you pass `this` as the owner, LiveData keeps delivering events for as long as the fragment is alive — even across multiple view recreations. `viewLifecycleOwner` scopes the subscription to exactly one view creation cycle. A related pitfall: accessing `viewLifecycleOwner` before `onViewCreated` (e.g., in `onCreate`) throws an `IllegalStateException` because the view lifecycle hasn't been created yet, so always register view-related observers in `onViewCreated`.

---

### Issue 2: Force-unwrap on nullable binding

**Problem:** `binding!!.recyclerView.adapter` throws `NullPointerException` the moment `binding` is `null`. Even with the lifecycle-owner fix in place, there is a narrow window where a synchronous or re-entrant delivery could reach the lambda during teardown. Using `!!` turns every such edge case into a hard crash with no recovery.

**Fix:** Replace `binding!!` with `binding?.recyclerView?.adapter` (safe-call chain). If `binding` is `null` the assignment is skipped silently, which is the correct behaviour — if there is no view, there is nothing to update.

**Explanation:** Kotlin's `!!` operator asserts non-nullability at runtime; if the assertion is wrong the JVM throws `NullPointerException` at that exact line. Using `?.` instead short-circuits the expression and does nothing when the receiver is `null`. This is the right default for any UI update that targets a view that may have been destroyed. The safe-call also acts as a secondary safety net: even if a race condition or a future refactor somehow allows a late delivery to slip through after CHANGE 1, the code handles it gracefully instead of crashing 2% of the time in production.
