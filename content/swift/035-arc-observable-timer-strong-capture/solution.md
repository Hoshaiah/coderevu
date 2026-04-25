## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Strong Self Capture in Timer
// ------------------------------------------------------------------------

class PollViewController: UIViewController {
    private var timer: Timer?
    private var matchID: String = ""

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        // CHANGE 1: Capture `self` weakly to break the retain cycle: Timer retains the closure, closure must NOT strongly retain the view controller or ARC can never deallocate it.
        timer = Timer.scheduledTimer(withTimeInterval: 5.0,
                                     repeats: true) { [weak self] _ in
            self?.fetchLatestScore()
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        timer?.invalidate()
        timer = nil
    }

    private func fetchLatestScore() {
        // URLSession call using matchID
    }
}
```

## Explanation

### Issue 1: Strong Capture Causes Retain Cycle

**Problem:** After the user navigates back, `PollViewController` is never deallocated. Instruments shows the instance count keeps climbing. Network logs confirm polling continues indefinitely, not just for one more interval.

**Fix:** Replace the bare `self` capture in the `Timer.scheduledTimer` closure with `[weak self]`, then call `self?.fetchLatestScore()` through the optional. This is the only change at the `CHANGE 1` site.

**Explanation:** `PollViewController` holds a strong reference to `timer` (via `self.timer`). The run loop holds a strong reference to the `Timer`. The `Timer` holds a strong reference to the closure. The closure, as written, holds a strong reference back to `self` — completing a cycle: controller → timer → closure → controller. ARC requires the reference count to reach zero before it frees an object, but every node in this cycle always has a count of at least one, so none of them are ever freed. `viewWillDisappear` does call `invalidate()` and nil out `self.timer`, which breaks the controller → timer edge and stops future firings, but the closure still holds a strong reference to the controller until the `Timer` object itself is deallocated, which requires the run loop to release it — and by the time that unwinds, the controller's dealloc has already been prevented. Using `[weak self]` means the closure holds no ownership over the controller, so once the navigation stack drops its reference, the controller's retain count hits zero and it deallocates normally. A related pitfall: if you ever use `[unowned self]` here instead of `[weak self]`, you risk a crash if the timer fires after dealloc in an edge case where invalidation is delayed; `[weak self]` with an optional call is the safe choice.

---
