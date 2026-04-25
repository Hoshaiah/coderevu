---
slug: android-fragment-view-lifecycle
track: kotlin
orderIndex: 95
title: Observer Leaks Across Fragment Views
difficulty: medium
tags:
  - android
  - lifecycle
  - coroutines
language: kotlin
---

## Context

This fragment lives in `com/example/app/ui/DashboardFragment.kt`. It observes a `LiveData` from a `ViewModel` to update a `RecyclerView` adapter. The observation is set up in `onCreateView`, which is a common pattern when the fragment is first learning about LiveData.

Users report that after navigating away from the dashboard and back several times, list updates are applied multiple times — an item that should appear once shows up two, three, or more times after repeated navigation. Memory profiler shows growing observer registrations on the `LiveData`.

The team confirmed that the `ViewModel` is shared at the activity level so it survives navigation, and the `LiveData` is emitting correct single values.

## Buggy code

```kotlin
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
        val view = inflater.inflate(R.layout.fragment_dashboard, container, false)
        adapter = DashboardAdapter()
        view.findViewById<RecyclerView>(R.id.recycler).adapter = adapter

        viewModel.items.observe(this) { items ->
            adapter.submitList(items)
        }

        return view
    }
}
```
