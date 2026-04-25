---
slug: android-viewmodel-livedata-wrong-observer
track: kotlin
orderIndex: 97
title: Observer Attached Outside viewLifecycleOwner
difficulty: medium
tags:
  - android
  - lifecycle
  - nullability
language: kotlin
---

## Context

This fragment lives in `DashboardFragment.kt` and observes a `LiveData` exposed by a `ViewModel`. The fragment is part of a bottom-navigation app where tabs are swapped in and out. Each tab uses the same `FragmentTransaction.replace` flow, so fragments go through `onDestroyView` without being fully destroyed.

Users report intermittent crashes after navigating between tabs a few times. The crash log shows a `NullPointerException` or `IllegalStateException` deep inside the observer lambda, specifically when the observer tries to access a view (e.g. a `RecyclerView` adapter) that no longer exists. The stack trace points into the LiveData notification path.

The developer already confirmed that the `ViewModel` is scoped correctly to the activity and survives tab switches as intended. The data itself is correct — only the delivery timing is wrong.

## Buggy code

```kotlin
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.Observer
import android.os.Bundle
import android.view.View

class DashboardFragment : Fragment() {

    private val viewModel: DashboardViewModel by viewModels()

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        viewModel.items.observe(this) { items ->
            // Access fragment's view hierarchy
            requireView().findViewById<androidx.recyclerview.widget.RecyclerView>(R.id.recycler)
                .adapter = ItemAdapter(items)
        }
    }
}

class DashboardViewModel : androidx.lifecycle.ViewModel() {
    val items: androidx.lifecycle.MutableLiveData<List<String>> =
        androidx.lifecycle.MutableLiveData(emptyList())
}
```
