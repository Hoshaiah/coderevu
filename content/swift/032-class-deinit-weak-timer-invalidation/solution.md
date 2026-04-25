## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Timer Not Invalidated on Deinit
// ------------------------------------------------------------------------

final class LiveScoreManager {
    private var timer: Timer?
    private var onUpdate: (([Score]) -> Void)?

    init(onUpdate: @escaping ([Score]) -> Void) {
        self.onUpdate = onUpdate
        startPolling()
    }

    private func startPolling() {
        timer = Timer.scheduledTimer(withTimeInterval: 5.0,
                                     repeats: true) { [weak self] _ in
            self?.fetchScores()
        }
    }

    private func fetchScores() {
        ScoreService.shared.fetch { [weak self] scores in
            DispatchQueue.main.async {
                self?.onUpdate?(scores)
            }
        }
    }

    // CHANGE 2: Added a public stopPolling() method so the owner can invalidate the timer explicitly when navigating away, breaking the run-loop retain before deinit would need to fire.
    func stopPolling() {
        timer?.invalidate()
        timer = nil
    }

    // CHANGE 1: deinit calls stopPolling() (which invalidates the timer) as a safety net, but this alone is insufficient — the run loop retains the timer, so deinit is only reachable after the caller invokes stopPolling() first.
    deinit {
        stopPolling()
    }
}
```

## Explanation

### Issue 1: Timer Holds Run-Loop Retain, Blocking Deinit

**Problem:** `deinit` calls `timer?.invalidate()`, but `deinit` is never reached because the run loop holds a strong reference to the `Timer`, which in turn keeps `LiveScoreManager` alive via the closure's capture list (even with `[weak self]`, the timer object itself is still retained by the run loop). The object's reference count never drops to zero, so memory is leaked and network traffic continues indefinitely.

**Fix:** The `deinit` body is replaced with a call to the new `stopPolling()` method (see CHANGE 1), making the invalidation logic reusable and consistent. More importantly, CHANGE 2 adds `stopPolling()` so callers can break the retain cycle explicitly before releasing their reference.

**Explanation:** `Timer.scheduledTimer` registers the timer with the current run loop, which retains it strongly. The timer closure captures `self` weakly, so that side is fine — but the run loop's hold on the timer keeps the timer alive, and because `LiveScoreManager` holds `timer` strongly (`private var timer: Timer?`), the cycle is: run loop → timer → (via the manager's strong reference) nothing directly, but the manager is never deallocated because nothing calls `invalidate()`. `deinit` is only triggered when the retain count hits zero, which requires the timer to already be gone, which requires `invalidate()` to have been called — a chicken-and-egg situation. The fix is to call `timer?.invalidate()` eagerly (via `stopPolling()`) from the owner — for example in the view controller's `viewDidDisappear` — so the run loop releases the timer, the manager's retain count can drop to zero, and `deinit` fires as a backstop.

---

### Issue 2: No External Stop Mechanism for Callers

**Problem:** The class exposes no way for the owner (e.g., a view controller) to stop polling when the Scores tab is dismissed. Every time the tab is opened, a new `LiveScoreManager` is created and starts a timer. Because nothing can stop the old ones, each dismissed tab leaves an orphaned timer firing every five seconds, accumulating until the app is killed.

**Fix:** CHANGE 2 adds `func stopPolling()`, which calls `timer?.invalidate()` and sets `timer = nil`. The owner calls this method — for example in `viewDidDisappear` or when the coordinator tears down the module — to break the run-loop retain and allow deallocation.

**Explanation:** Without a stop method, the only place `invalidate()` could be called is `deinit`, but `deinit` is blocked (Issue 1), so no path exists at runtime that ever stops the timer. Adding `stopPolling()` gives callers an explicit lifecycle hook. Setting `timer = nil` after `invalidate()` is also important: it drops the manager's own strong reference to the `Timer` object, allowing it to be freed immediately rather than lingering until the next ARC pass. A related pitfall: if the owner calls `stopPolling()` and then the manager is somehow re-used, the `timer` property is `nil` and `startPolling()` would need to be called again — which is the correct, predictable behavior rather than having a zombie timer firing in the background.
