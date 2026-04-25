## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Observer Leaks Across Fragment Views
// ------------------------------------------------------------------------

import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup

class DashboardFragment : Fragment() {

    private val viewModel: DashboardViewModel by activityViewModels()
    private lateinit var adapter: DashboardAdapter

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        return inflater.inflate(R.layout.fragment_dashboard, container, false)
    }

    // CHANGE 2: Moved view binding and observation into onViewCreated so the view lifecycle owner is available and setup matches the view's lifetime.
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        adapter = DashboardAdapter()
        view.findViewById<RecyclerView>(R.id.recycler).adapter = adapter

        // CHANGE 1: Use viewLifecycleOwner instead of `this` so the observer is tied to the view's lifecycle and is automatically removed when the view is destroyed on navigation.
        viewModel.items.observe(viewLifecycleOwner) { items ->
            adapter.submitList(items)
        }
    }
}
```

## Explanation

### Issue 1: Wrong lifecycle owner accumulates observers

**Problem:** After navigating away from `DashboardFragment` and back several times, list items appear duplicated proportionally to the number of round trips. Each navigation creates a new view but the same Fragment instance remains alive (because the `ViewModel` is activity-scoped), and each `onCreateView` call registers an additional observer that is never removed.

**Fix:** Replace `this` with `viewLifecycleOwner` in the `observe` call inside `onViewCreated`. `viewLifecycleOwner` is a `LifecycleOwner` whose lifecycle starts at `ON_CREATE` of the view and ends at `ON_DESTROY` of the view, automatically unsubscribing the observer when the fragment's view is torn down.

**Explanation:** A Fragment's own lifecycle (`this` as `LifecycleOwner`) moves to `DESTROYED` only when the fragment is removed from the back stack entirely. While a fragment sits on the back stack, its view is destroyed and recreated on each navigation, but the fragment itself stays in `CREATED`/`STARTED` states. Passing `this` to `observe` therefore registers a brand-new observer on every `onCreateView` call without ever removing the previous one, because the fragment lifecycle never hits `DESTROYED` to trigger cleanup. Each live observer fires when the `LiveData` emits, so after three navigations you have three observers each calling `adapter.submitList`, which is why items appear three times. Using `viewLifecycleOwner` ties each observer to the corresponding view's shorter lifecycle, so it is removed automatically when the view is destroyed, and the next `onViewCreated` registers exactly one fresh observer.

---

### Issue 2: Observer setup in `onCreateView` instead of `onViewCreated`

**Problem:** Putting view-binding code (`findViewById`, adapter wiring, and `observe`) inside `onCreateView` works initially but is fragile: `viewLifecycleOwner` is not yet valid inside `onCreateView` — accessing it there throws an `IllegalStateException` — so the fix to issue 1 forces the observation code to move out of `onCreateView` anyway.

**Fix:** `onCreateView` is reduced to only inflating and returning the layout. All view interaction — `findViewById`, setting the adapter, and calling `observe` — moves into `onViewCreated`, where `viewLifecycleOwner` is guaranteed to be initialized and valid.

**Explanation:** Android guarantees that `viewLifecycleOwner` is non-null and its lifecycle is initialized by the time `onViewCreated` is called. Inside `onCreateView`, the view is being constructed and the view lifecycle owner does not yet exist, so calling `viewLifecycleOwner` there crashes at runtime. Keeping inflation in `onCreateView` and all view-dependent setup in `onViewCreated` also matches the documented Android lifecycle contract and makes the class easier to maintain, because every line that touches a view widget sits in a method that is only called once the view is ready.
