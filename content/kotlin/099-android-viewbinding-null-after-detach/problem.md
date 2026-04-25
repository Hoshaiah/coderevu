---
slug: android-viewbinding-null-after-detach
track: kotlin
orderIndex: 99
title: ViewBinding Accessed After View Detached
difficulty: hard
tags:
  - android
  - nullability
  - lifecycle
language: kotlin
---

## Context

`SearchFragment.kt` is a list screen that starts a debounced search when the user types into a search box. The debounce is implemented with a `Handler.postDelayed` callback so that the network call fires 300 ms after the last keystroke. The result updates a `RecyclerView` via the fragment's view binding.

Crashlytics reports intermittent `NullPointerException` inside the `Runnable` body, always on the binding access line. The crash only happens when the user types quickly and then immediately navigates away from the fragment within the debounce window. Stack traces confirm the crash is on the main thread.

The team tried adding a null-check on the binding variable but the field is declared as non-null, so the compiler rejects `binding?.nameTextView`. They considered using `isAdded` but that doesn't fully protect binding access.

## Buggy code

```kotlin
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import androidx.fragment.app.Fragment

class SearchFragment : Fragment() {
    private lateinit var binding: SearchBinding
    private val handler = Handler(Looper.getMainLooper())
    private var pendingSearch: Runnable? = null

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding = SearchBinding.bind(view)

        binding.searchInput.addTextChangedListener { text ->
            pendingSearch?.let { handler.removeCallbacks(it) }
            val runnable = Runnable {
                val query = text?.toString() ?: return@Runnable
                binding.resultsView.adapter = SearchAdapter(query)
            }
            pendingSearch = runnable
            handler.postDelayed(runnable, 300)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
    }
}
```
