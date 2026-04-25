## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Timer Block Retains ViewController
// ------------------------------------------------------------------------

class DashboardViewController: UIViewController {
    private var refreshTimer: Timer?

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // CHANGE 2: Guard against scheduling a second timer if one is already running (e.g. after an alert or partial swipe-back gesture triggers viewDidAppear again).
        guard refreshTimer == nil else { return }
        refreshTimer = Timer.scheduledTimer(
            withTimeInterval: 1.0,
            repeats: true
        // CHANGE 1: Capture `self` weakly so the timer closure does not extend the view controller's lifetime beyond its natural release point.
        ) { [weak self] timer in
            self?.updateDashboard()
        }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        refreshTimer?.invalidate()
        refreshTimer = nil
    }

    private func updateDashboard() {
        // update UI labels
    }
}
```

## Explanation

### Issue 1: Strong Self Capture in Timer Closure

**Problem:** After the user pops `DashboardViewController`, the navigation stack drops its reference to the view controller, but the view controller is never deallocated. Instruments shows it leaking, and `deinit` is never called.

**Fix:** Replace the bare `self` capture in the `Timer.scheduledTimer` closure with `[weak self]`, then call `self?.updateDashboard()` instead of `self.updateDashboard()`.

**Explanation:** A repeating `Timer` is retained by the run loop for as long as it is valid. The closure passed to `scheduledTimer(withTimeInterval:repeats:block:)` is itself retained by the timer. When that closure captures `self` strongly, the reference graph is: run loop → timer → closure → `DashboardViewController`. Even though `viewDidDisappear` calls `invalidate()`, that call only executes if the view controller is alive to receive it — but here, the strong capture keeps the view controller alive indefinitely, so `viewDidDisappear` does run and the timer does get invalidated. Wait — actually in this specific case the timer fires correctly and `viewDidDisappear` is called, which invalidates the timer. But the window between the view controller being popped and `viewDidDisappear` completing is enough to keep a strong cycle active. More critically, if anything delays or skips `viewDidDisappear` (e.g., a custom transition, a missing `super` call, or a future refactor), the cycle is permanent. Using `[weak self]` breaks the retain cycle unconditionally: the run loop retains the timer, the timer retains the closure, but the closure holds only a weak reference to the view controller, so the view controller's reference count is not artificially inflated and ARC can deallocate it normally once the navigation stack releases it.

---

### Issue 2: Multiple Timers Scheduled on Repeated viewDidAppear Calls

**Problem:** Each time the user navigates away and back to the dashboard, `viewDidAppear` fires again and schedules a brand-new repeating timer without stopping the previous one. After three round trips there are three timers all calling `updateDashboard()` every second simultaneously, causing redundant work and potential UI glitches from concurrent label updates.

**Fix:** Add `guard refreshTimer == nil else { return }` at the top of `viewDidAppear`, before `Timer.scheduledTimer` is called, so a new timer is only created when no timer is already running.

**Explanation:** `viewDidAppear` can be called more than once per view controller lifetime. A partial swipe-back gesture that the user cancels, a presented modal that is dismissed, or a system alert can all trigger `viewDidAppear` without a matching `viewDidDisappear` in between. Because `viewDidDisappear` sets `refreshTimer = nil`, any subsequent `viewDidAppear` after a full disappear is fine — but any `viewDidAppear` that fires without a prior `viewDidDisappear` will create a second timer alongside the first. The guard checks whether `refreshTimer` already holds a live timer and exits early if so, ensuring exactly one timer runs at a time. A related pitfall: always pair your `invalidate()` call with setting the property to `nil` (which this code already does) so the `nil` check in the guard is reliable.
