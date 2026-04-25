## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — ViewBinding Accessed After View Detached
// ------------------------------------------------------------------------

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import androidx.fragment.app.Fragment

class SearchFragment : Fragment() {
    // CHANGE 3: made nullable so it can be cleared in onDestroyView, allowing safe null-checks at runtime
    private var binding: SearchBinding? = null
    private val handler = Handler(Looper.getMainLooper())
    private var pendingSearch: Runnable? = null

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding = SearchBinding.bind(view)

        binding?.searchInput?.addTextChangedListener { text ->
            pendingSearch?.let { handler.removeCallbacks(it) }
            val runnable = Runnable {
                // CHANGE 1: guard against the binding being null (view destroyed) before touching any view reference
                val b = binding ?: return@Runnable
                val query = text?.toString() ?: return@Runnable
                b.resultsView.adapter = SearchAdapter(query)
            }
            pendingSearch = runnable
            handler.postDelayed(runnable, 300)
        }
    }

    override fun onDestroyView() {
        // CHANGE 2: remove any pending search callback so the Runnable never fires after the view is gone
        pendingSearch?.let { handler.removeCallbacks(it) }
        pendingSearch = null
        // CHANGE 3: null out binding so that any Runnable that already started executing returns early via the guard in CHANGE 1
        binding = null
        super.onDestroyView()
    }
}
```

## Explanation

### Issue 1: Binding Accessed After View Destroyed

**Problem:** When the user types and then immediately navigates away, the `Runnable` posted with `postDelayed` fires 300 ms later on the main thread. At that point `binding` still holds a reference to a `SearchBinding` that was inflated against a view that is no longer attached to the window. Accessing `binding.resultsView` on a detached view throws a `NullPointerException` inside RecyclerView's layout machinery.

**Fix:** At the top of the `Runnable` body, capture `binding` into a local val with a null-check: `val b = binding ?: return@Runnable`. All subsequent view accesses use `b` instead of the field directly.

**Explanation:** The fragment lifecycle detaches and destroys the view before the delayed callback fires. Because `binding` was `lateinit` (non-null to the compiler), the compiler rejected `binding?.resultsView`, giving the team a false sense that no null-check was possible. Making the field nullable (Issue 3) unblocks the guard here. The local `val b` captures the current value of `binding` atomically at the start of the lambda; if `onDestroyView` already ran and set `binding = null`, `b` is null and the lambda exits cleanly. If `onDestroyView` races and sets `binding = null` after the capture but before the adapter assignment, `b` still holds the now-invalid binding — which is why Issue 2's callback removal is also necessary to prevent the Runnable from running at all.

---

### Issue 2: Pending Callback Not Removed on Destroy

**Problem:** `onDestroyView` was an empty override that called `super`. The `Handler` still holds a reference to any `Runnable` queued during the debounce window. After the fragment's view is destroyed that Runnable fires unconditionally, reaching code that accesses view references.

**Fix:** In `onDestroyView`, call `pendingSearch?.let { handler.removeCallbacks(it) }` before `super.onDestroyView()`, then set `pendingSearch = null`.

**Explanation:** `Handler.removeCallbacks(runnable)` pulls the specific `Runnable` instance out of the message queue before it is dispatched. Because everything here is on the main thread there is no race: `onDestroyView` runs, removes the callback, and the Runnable never executes. This is the primary defence — the null-check in Issue 1 is a belt-and-suspenders guard for any code path that bypasses this removal (e.g. a future refactor that posts from a background thread). Forgetting to remove callbacks is also a memory-leak vector: the `Handler` holds a reference to the `Runnable`, the `Runnable` captures the fragment via its closure, and the fragment cannot be garbage-collected until the callback fires or is removed.

---

### Issue 3: Non-Null Binding Prevents Safe Null-Check

**Problem:** `binding` was declared `private lateinit var binding: SearchBinding`. The compiler treats `lateinit var` fields as non-null, so `binding?.resultsView` is a compile error. The team could not add the null-check they needed, and the binding could not be cleared in `onDestroyView` to signal that the view is gone.

**Fix:** Change the declaration to `private var binding: SearchBinding? = null`. Update the assignment in `onViewCreated` to remain a direct assignment, and set `binding = null` at the end of `onDestroyView`.

**Explanation:** `lateinit var` is a convenience for injecting a non-null value after construction but before first use, under the assumption the value lives as long as the object. Fragment bindings violate that assumption: the binding is valid only between `onViewCreated` and `onDestroyView`, but the fragment object itself lives longer (across back-stack pops, for example). Switching to a nullable `var` accurately models that shorter lifetime. Setting it to null in `onDestroyView` acts as a clear signal to any in-flight code (the Runnable) that the view era is over, enabling the early-return guard in Issue 1 to work. A related pitfall: if you keep `lateinit` and just add an `isInitialized` check, you still access a binding pointing at a destroyed view, because `isInitialized` only tells you the field was ever assigned, not that the view is still alive.
