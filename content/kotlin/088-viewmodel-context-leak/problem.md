---
slug: viewmodel-context-leak
track: kotlin
orderIndex: 88
title: Activity Context Leaked in ViewModel
difficulty: easy
tags:
  - android
  - nullability
  - lifecycle
language: kotlin
---

## Context

`ui/SearchViewModel.kt` was written by a developer migrating from a plain Activity-based architecture to MVVM. The ViewModel needs to access string resources for formatting search result labels, so the developer passed the `Activity` context into the ViewModel constructor — a pattern familiar from non-MVVM code.

The app leaks memory on every screen rotation, visible in the Android Studio Memory Profiler as growing `SearchActivity` instances that are never GC'd. Over multiple rotations, the heap usage climbs until the app is killed by the OOM killer.

Heap dumps confirm that `SearchViewModel` (which survives rotation) holds a strong reference to a destroyed `SearchActivity`. The fix should not require passing any lifecycle-aware object into the ViewModel constructor.

## Buggy code

```kotlin
import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

class SearchViewModel(private val context: Context) : ViewModel() {

    private val _results = mutableListOf<String>()

    fun search(query: String) {
        viewModelScope.launch {
            val label = context.getString(R.string.result_label)
            // ... perform search and format results using label
            _results.add("$label: $query")
        }
    }
}

// In SearchActivity:
// val viewModel = ViewModelProvider(
//     this,
//     object : ViewModelProvider.Factory {
//         override fun <T : ViewModel> create(cls: Class<T>) =
//             SearchViewModel(this@SearchActivity) as T
//     }
// ).get(SearchViewModel::class.java)
```
