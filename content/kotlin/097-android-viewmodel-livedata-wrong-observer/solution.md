## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Observer Attached Outside viewLifecycleOwner
// ------------------------------------------------------------------------

import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.Observer
import androidx.recyclerview.widget.RecyclerView
import android.os.Bundle
import android.view.View

class DashboardFragment : Fragment() {

    private val viewModel: DashboardViewModel by viewModels()
    private var itemAdapter: ItemAdapter? = null

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // CHANGE 2: Create the adapter once and set it on the RecyclerView here, so subsequent LiveData emissions only update data, not recreate the adapter.
        val recycler = view.findViewById<RecyclerView>(R.id.recycler)
        itemAdapter = ItemAdapter(emptyList())
        recycler.adapter = itemAdapter

        // CHANGE 1: Use viewLifecycleOwner instead of `this` so the observer is automatically removed when the view is destroyed, preventing delivery of updates to a dead view hierarchy.
        viewModel.items.observe(viewLifecycleOwner) { items ->
            itemAdapter?.updateItems(items)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        // CHANGE 2: Clear the adapter reference so it can be garbage-collected and we hold no stale view references.
        itemAdapter = null
    }
}

class ItemAdapter(private var items: List<String>) : androidx.recyclerview.widget.RecyclerView.Adapter<androidx.recyclerview.widget.RecyclerView.ViewHolder>() {
    fun updateItems(newItems: List<String>) {
        items = newItems
        notifyDataSetChanged()
    }
    override fun onCreateViewHolder(parent: android.view.ViewGroup, viewType: Int): androidx.recyclerview.widget.RecyclerView.ViewHolder {
        val v = android.view.View(parent.context)
        return object : androidx.recyclerview.widget.RecyclerView.ViewHolder(v) {}
    }
    override fun onBindViewHolder(holder: androidx.recyclerview.widget.RecyclerView.ViewHolder, position: Int) {}
    override fun getItemCount() = items.size
}

class DashboardViewModel : androidx.lifecycle.ViewModel() {
    val items: androidx.lifecycle.MutableLiveData<List<String>> =
        androidx.lifecycle.MutableLiveData(emptyList())
}
```

## Explanation

### Issue 1: Wrong lifecycle owner for LiveData observer

**Problem:** Users see a `NullPointerException` or `IllegalStateException` after switching tabs a few times. The crash happens inside the observer lambda when it calls `requireView().findViewById(...)` on a view that no longer exists because the fragment has gone through `onDestroyView`.

**Fix:** Replace `this` with `viewLifecycleOwner` in the `observe(...)` call at the `CHANGE 1` site. `viewLifecycleOwner` is destroyed at `onDestroyView`, which causes LiveData to automatically remove this observer at that point.

**Explanation:** A `Fragment` has two separate lifecycles: its own (`Fragment.getLifecycle()`, controlled by `this`) and its view's (`Fragment.getViewLifecycleOwner()`). When `replace` is used in navigation, the fragment instance survives but the view is torn down in `onDestroyView`. If the observer is tied to the fragment's own lifecycle (`this`), it stays active after the view is gone. The `ViewModel` is activity-scoped, so it remains alive and can post new values at any time — including after `onDestroyView`. When that happens, the observer runs, calls `requireView()`, and either gets an `IllegalStateException` (if the view is completely null) or an `NPE` when traversing a stale view reference. Tying the observer to `viewLifecycleOwner` means LiveData stops notifying the observer as soon as the view is destroyed, so the lambda never runs against a dead view tree. A related pitfall: if you later re-subscribe in `onViewCreated` with `this`, each tab switch registers an additional observer that never unregisters, piling up duplicate callbacks.

---

### Issue 2: Adapter recreated on every LiveData emission

**Problem:** Every time `items` emits a new value, the code constructs a brand-new `ItemAdapter` and assigns it to the `RecyclerView`. This forces the list to re-layout from scratch, losing scroll position and causing a visible flicker on each update.

**Fix:** At `CHANGE 2`, the adapter is created once in `onViewCreated` and stored in `itemAdapter`. The observer now calls `itemAdapter?.updateItems(items)` to push new data into the existing adapter. `itemAdapter` is cleared to `null` in `onDestroyView` to avoid holding stale view references.

**Explanation:** `RecyclerView.setAdapter(...)` is expensive: it detaches all views, resets scroll state, and triggers a full layout pass. Calling it on every data update means the list jumps back to the top and redraws entirely even if only one item changed. Keeping the adapter instance stable and calling `notifyDataSetChanged()` (or a `DiffUtil`-based method) lets `RecyclerView` reconcile just the changed rows. Holding `itemAdapter` as a nullable field and nulling it in `onDestroyView` also prevents a memory leak where the adapter (which holds a reference to view holders and the old view tree) is kept alive by the fragment instance between tab switches.
