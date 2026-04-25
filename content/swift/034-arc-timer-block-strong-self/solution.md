## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Timer Block Retains ViewController Permanently
// ------------------------------------------------------------------------

import UIKit

class DashboardViewController: UIViewController {
    var pollingTimer: Timer?
    var badgeCount: Int = 0

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // CHANGE 2: Guard against starting a second timer if one is already running (e.g. after navigating away and back).
        guard pollingTimer == nil else { return }
        pollingTimer = Timer.scheduledTimer(
            withTimeInterval: 5.0,
            repeats: true
        // CHANGE 1: Capture `self` weakly so the timer closure does not form a strong reference cycle with the view controller.
        ) { [weak self] timer in
            self?.refreshBadgeCount()
        }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        pollingTimer?.invalidate()
        pollingTimer = nil
    }

    func refreshBadgeCount() {
        badgeCount += 1
        title = "Dashboard (\(badgeCount))"
    }

    deinit {
        print("DashboardViewController deallocated")
    }
}
```

## Explanation

### Issue 1: Strong Capture Retain Cycle in Timer Closure

**Problem:** Every `DashboardViewController` instance that is pushed or presented stays in memory forever. Instruments shows a pile-up of instances and `deinit` is never called. The app's memory grows each time the user navigates to the dashboard.

**Fix:** Replace the plain `self` capture in the timer block with `[weak self]`, and change the call site to `self?.refreshBadgeCount()`. This is the only change at the CHANGE 1 site.

**Explanation:** `Timer.scheduledTimer(withTimeInterval:repeats:block:)` retains its closure strongly, and the run loop retains the timer. The closure in the buggy code captures `self` strongly, which means: run loop → timer → closure → view controller. At the same time, the view controller holds `pollingTimer`, so: view controller → timer. That is a cycle — neither side can reach zero references. Making `self` weak inside the closure breaks the cycle: the closure no longer holds a strong reference to the view controller, so when the navigation stack pops it, its reference count can drop to zero and `deinit` fires. One related pitfall: after `deinit` the timer still fires until `invalidate()` is called, but with `[weak self]` the closure just receives `nil` and does nothing, so there is no crash.

---

### Issue 2: New Timer Scheduled on Every `viewDidAppear`

**Problem:** Each time the user navigates away and back, `viewDidAppear` fires again and a brand-new repeating timer is created. The previous timer reference is overwritten in `pollingTimer` without being invalidated, so the old timer keeps firing. After two round-trips there are three simultaneous timers; the badge increments three times every 5 seconds and the memory from those zombie timers never reclaims.

**Fix:** Add `guard pollingTimer == nil else { return }` at the top of `viewDidAppear`, before the `Timer.scheduledTimer` call. This is the CHANGE 2 site.

**Explanation:** `viewDidAppear` is called every time the view comes on screen, not just the first time. The buggy code assigns a new timer to `pollingTimer` unconditionally, silently dropping the reference to the previous timer without calling `invalidate()` on it. An invalidated-less timer stays scheduled on the run loop indefinitely. The guard check ensures a timer is only created when none exists. `viewDidDisappear` already sets `pollingTimer = nil` after invalidating, so by the time `viewDidAppear` fires again the guard passes and a fresh timer is created correctly. A complementary defensive measure is to call `pollingTimer?.invalidate()` before assigning a new one, but the guard is cleaner and avoids the double-timer window entirely.
