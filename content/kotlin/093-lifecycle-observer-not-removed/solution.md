## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Lifecycle Observer Leaks After Destroy
// ------------------------------------------------------------------------

import androidx.lifecycle.*

// CHANGE 2: Implement DefaultLifecycleObserver instead of the deprecated annotation-based LifecycleObserver to avoid reflection and minification issues.
class LocationTracker(private val lifecycle: Lifecycle) : DefaultLifecycleObserver {

    init {
        lifecycle.addObserver(this)
    }

    // CHANGE 2: Replace @OnLifecycleEvent annotation with the typed override from DefaultLifecycleObserver.
    override fun onStart(owner: LifecycleOwner) {
        println("Location tracking started")
        // start GPS updates
    }

    // CHANGE 2: Replace @OnLifecycleEvent annotation with the typed override from DefaultLifecycleObserver.
    override fun onStop(owner: LifecycleOwner) {
        println("Location tracking stopped")
        // stop GPS updates
    }

    // CHANGE 1: Call lifecycle.removeObserver(this) so the Lifecycle drops its reference to this tracker and allows the Activity to be garbage collected.
    override fun onDestroy(owner: LifecycleOwner) {
        println("Activity destroyed, cleaning up resources")
        lifecycle.removeObserver(this)
    }
}
```

## Explanation

### Issue 1: Observer Never Removed, Activity Retained

**Problem:** Every `LocationTracker` instance is added to the `Activity`'s `Lifecycle` via `addObserver`, but `removeObserver` is never called. After `onDestroy` fires, the `Lifecycle` object still holds a reference to the `LocationTracker`, which in turn holds a reference to the `Lifecycle` (and by extension the `Activity`). The Activity cannot be garbage collected, and each new navigation session adds another retained Activity to the heap.

**Fix:** In the `onDestroy` override, add `lifecycle.removeObserver(this)` so the `Lifecycle` releases its strong reference to the `LocationTracker` at CHANGE 1.

**Explanation:** `Lifecycle.addObserver` stores the observer in an internal list. Until `removeObserver` is called with the same instance, that reference lives for the duration of the `Lifecycle` object itself. Because `LocationTracker` also holds a field reference to `lifecycle`, you get a reference cycle, but the real problem is that the `Lifecycle` is owned by the framework and outlives the `Activity`'s logical lifetime — the framework retains it while processing the destroy event. Calling `removeObserver` inside `onDestroy` breaks the chain. A related pitfall: if `LocationTracker` is stored in a `ViewModel` or a static field instead of being scoped to the `Activity`, even `removeObserver` may not be enough — the tracker itself would also need proper scoping.

---

### Issue 2: Deprecated Annotation-Based LifecycleObserver

**Problem:** The `@OnLifecycleEvent` annotation API was deprecated in `lifecycle-common 2.4.0` and the underlying reflection mechanism it uses is stripped incorrectly by some ProGuard/R8 configurations, causing lifecycle callbacks to silently not fire in release builds.

**Fix:** Replace the `LifecycleObserver` interface and `@OnLifecycleEvent` annotations with `DefaultLifecycleObserver`, then override `onStart`, `onStop`, and `onDestroy` directly as shown at CHANGE 2 sites.

**Explanation:** The annotation-based approach works by scanning observer methods at runtime with reflection, looking for `@OnLifecycleEvent`. If R8 renames or removes those methods, the scan finds nothing and the callbacks are skipped — a silent failure that only appears in release builds. `DefaultLifecycleObserver` uses interface dispatch instead: the `Lifecycle` calls the override directly by vtable, so no reflection is involved and minification is safe. Migrating also removes the need for the `lifecycle-common-java8` artifact workaround that older projects sometimes add. The `owner: LifecycleOwner` parameter in each override gives direct access to the owner if needed, which the annotation API did not provide cleanly.
