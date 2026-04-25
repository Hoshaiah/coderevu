---
slug: android-lifecycle-observer-crash-after-destroy
track: kotlin
orderIndex: 96
title: Observer Fired After Fragment Destroy
difficulty: medium
tags:
  - android
  - lifecycle
  - nullability
language: kotlin
---

## Context

This Fragment lives in `ui/SearchFragment.kt` and observes a `LiveData<List<SearchResult>>` from a shared `SearchViewModel`. Results are displayed in a `RecyclerView`. The fragment is part of a bottom-navigation app where fragments are replaced (not added to the back stack) when the user switches tabs.

Crashes appear in production with `NullPointerException: binding is null` on the line that calls `binding.recyclerView.adapter`. The crash occurs roughly 2% of the time when users rapidly switch tabs. It is hard to reproduce locally because it requires specific timing: the LiveData observer fires just as the fragment's view is being torn down.

The team checked the `viewLifecycleOwner` documentation and thought they were using it correctly, but they accidentally used `this` (the Fragment itself) as the lifecycle owner for the observer, which has a longer lifetime than the view.

## Buggy code

```kotlin
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

        // Bug: observing with 'this' (Fragment lifecycle) instead of viewLifecycleOwner
        viewModel.results.observe(this) { results ->
            binding!!.recyclerView.adapter = SearchAdapter(results)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        binding = null
    }
}
```
