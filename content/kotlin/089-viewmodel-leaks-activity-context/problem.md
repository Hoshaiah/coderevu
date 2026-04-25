---
slug: viewmodel-leaks-activity-context
track: kotlin
orderIndex: 89
title: ViewModel Holds Activity Context Reference
difficulty: easy
tags:
  - android
  - memory-leak
  - lifecycle
language: kotlin
---

## Context

In `ui/search/SearchViewModel.kt`, the ViewModel needs to resolve a localised string for display in the search results header. A developer passed the `Activity` context into the ViewModel constructor directly and stored it as a field so the string resource can be resolved at any time.

After several screen rotations, the app's memory usage climbs steadily and never recovers. A leak canary report points directly to the `SearchViewModel` holding a strong reference to a destroyed `Activity`. The ViewModel itself outlives the Activity across configuration changes because it is retained by the `ViewModelStore`.

The team confirmed this is not related to `companion object` static references. The leak is the stored `Activity` reference inside the ViewModel instance.

## Buggy code

```kotlin
import android.app.Activity
import androidx.lifecycle.ViewModel

class SearchViewModel(private val activity: Activity) : ViewModel() {

    val headerText: String
        get() = activity.getString(R.string.search_header)

    fun search(query: String): List<Result> {
        // ... search logic
        return emptyList()
    }
}
```
