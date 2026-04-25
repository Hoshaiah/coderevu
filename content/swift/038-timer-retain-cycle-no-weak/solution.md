## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Timer Target Retain Cycle
// ------------------------------------------------------------------------

import UIKit

class LiveScoreboard: UIViewController {
    private var timer: Timer?
    private var scores: [String] = []

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // CHANGE 2: Guard against scheduling a second timer if one is already running (e.g. return from modal)
        guard timer == nil else { return }
        // CHANGE 1: Use a block-based Timer with [weak self] capture to avoid the strong retain cycle that the target/selector form creates; the run loop retains the timer but not self
        timer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            self?.fetchScores()
        }
    }

    // CHANGE 3: Invalidate in deinit as the guaranteed final cleanup; deinit fires once the retain cycle is gone and the VC is truly released
    deinit {
        timer?.invalidate()
        timer = nil
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        // CHANGE 3: Also invalidate here for the normal navigation path so the timer stops promptly when leaving the screen, not only when the VC is deallocated
        timer?.invalidate()
        timer = nil
    }

    @objc private func fetchScores() {
        // network call to update scores
        scores.append("Goal!")
        tableView.reloadData()
    }

    private var tableView: UITableView = UITableView()
}
```

## Explanation

### Issue 1: Strong Retain Cycle via Timer Target

**Problem:** Every `LiveScoreboard` instance pushed onto the navigation stack leaks. Memory Instruments shows heap growth with each navigation because each old instance stays alive indefinitely. The timer also keeps firing and making network requests after the screen is gone.

**Fix:** Replace `Timer.scheduledTimer(timeInterval:target:selector:repeats:)` with `Timer.scheduledTimer(withTimeInterval:repeats:block:)` and capture `self` weakly inside the block (`[weak self]`). This is CHANGE 1.

**Explanation:** When you pass `self` as the `target` parameter, the run loop retains the timer, and the timer retains `self` with a strong reference. Even if the navigation controller releases its reference to `LiveScoreboard`, the run loop's chain — run loop → timer → view controller — keeps the object alive. The block-based API breaks this: the run loop still retains the timer, but the timer only retains the closure, and the closure holds only a weak reference to `self`. Once the navigation controller drops the VC, nothing else holds a strong reference and `deinit` runs. The related pitfall is forgetting to guard against `self` being nil inside the block; the `self?.fetchScores()` optional-chaining handles that correctly.

---

### Issue 2: Multiple Timers Scheduled on Repeated `viewDidAppear` Calls

**Problem:** If any modal sheet or child view controller is presented and then dismissed while `LiveScoreboard` is visible, `viewDidAppear` fires again. Each call schedules a new timer without stopping the previous one, so scores get fetched twice (or more) per interval and memory grows with every appearance.

**Fix:** Add a `guard timer == nil else { return }` check at the top of `viewDidAppear` before creating the timer. This is CHANGE 2.

**Explanation:** `viewDidAppear` is not a one-shot event; UIKit calls it every time the view becomes visible, including after dismissing a presented controller. Checking `timer == nil` before scheduling ensures only one timer exists at a time. The complementary invalidation in `viewWillDisappear` sets `timer = nil`, so the guard resets correctly for the next appearance cycle.

---

### Issue 3: Unreliable Invalidation Placement

**Problem:** The original code relies solely on `viewWillDisappear` to stop the timer. An interactive pop gesture that is started but then cancelled can leave the timer running even after navigation is complete, and in cases where the VC is deallocated without `viewWillDisappear` firing (rare edge cases with container controllers), the timer never stops.

**Fix:** Add a `deinit` that calls `timer?.invalidate()` as a guaranteed backstop, while keeping (and restoring) the `viewWillDisappear` invalidation as the prompt, normal-path stop. This is CHANGE 3.

**Explanation:** `viewWillDisappear` is the right place to stop the timer eagerly during normal navigation, but it is not guaranteed to be the final word. `deinit` is guaranteed to run exactly once when the object's reference count reaches zero, making it a reliable safety net. With the retain cycle fixed (Issue 1), `deinit` will actually be called. Keeping the `viewWillDisappear` invalidation means the timer stops as soon as the user leaves the screen rather than waiting for deallocation, which avoids spurious background network calls during the brief window between navigation and deallocation.
