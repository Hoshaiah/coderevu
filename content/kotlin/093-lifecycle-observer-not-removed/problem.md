---
slug: lifecycle-observer-not-removed
track: kotlin
orderIndex: 93
title: Lifecycle Observer Leaks After Destroy
difficulty: medium
tags:
  - android
  - lifecycle
  - memory-leak
language: kotlin
---

## Context

This is `LocationTracker.kt` in an Android navigation app. It registers a `LifecycleObserver` on an `Activity`'s lifecycle to start and stop location updates. The tracker is created fresh on every `Activity.onCreate()` call and is expected to clean up after itself.

After extended use with many navigation sessions, memory profiler snapshots show a growing number of `Activity` instances retained in memory — none are being garbage collected. Heap dumps confirm that each `Activity` is being held by a chain rooted at the `Lifecycle` object.

The team confirmed that `onDestroy()` is being called correctly on the activity. Removing the `LocationTracker` entirely eliminates the leak, isolating it to this class.

## Buggy code

```kotlin
import androidx.lifecycle.*

class LocationTracker(private val lifecycle: Lifecycle) : LifecycleObserver {

    init {
        lifecycle.addObserver(this)
    }

    @OnLifecycleEvent(Lifecycle.Event.ON_START)
    fun startTracking() {
        println("Location tracking started")
        // start GPS updates
    }

    @OnLifecycleEvent(Lifecycle.Event.ON_STOP)
    fun stopTracking() {
        println("Location tracking stopped")
        // stop GPS updates
    }

    @OnLifecycleEvent(Lifecycle.Event.ON_DESTROY)
    fun onDestroy() {
        println("Activity destroyed, cleaning up resources")
        // clean up resources but forget to remove the observer
    }
}
```
