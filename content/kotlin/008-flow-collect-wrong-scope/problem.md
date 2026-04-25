---
slug: flow-collect-wrong-scope
track: kotlin
orderIndex: 8
title: Flow Collected in Wrong Scope
difficulty: medium
tags:
  - coroutines
  - android
  - lifecycle
language: kotlin
---

## Context

`ui/FeedViewModel.kt` and `ui/FeedFragment.kt` form a standard MVVM pair. The ViewModel exposes a `StateFlow` of feed items and the Fragment collects it to update the UI. The code was written by a developer familiar with RxJava who used `lifecycleScope.launch` as the analog of `subscribe`.

Users report that the app crashes with `IllegalStateException` when they put the app in the background and then restore it, specifically after screen rotation. Some users also report duplicate network calls being logged — one per rotation — visible in Charles Proxy traces.

The team suspects a ViewModel scoping issue but the ViewModel itself survives rotation correctly. The problem is in how the Fragment subscribes to the flow.

## Buggy code

```kotlin
// FeedFragment.kt
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import android.os.Bundle
import android.view.View

class FeedFragment : Fragment() {
    private val viewModel: FeedViewModel by viewModels()

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        lifecycleScope.launch {
            viewModel.feedItems.collect { items ->
                adapter.submitList(items)
            }
        }
    }
}
```
