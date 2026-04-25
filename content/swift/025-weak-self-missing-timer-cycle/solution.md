## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Retain Cycle Via Timer Closure
// ------------------------------------------------------------------------

import Foundation

final class SessionManager {
    private var timer: Timer?
    private let userID: String
    private var tickCount = 0

    init(userID: String) {
        self.userID = userID
    }

    func startHeartbeat() {
        // CHANGE 1: Capture `self` weakly to break the retain cycle; Timer block no longer keeps SessionManager alive.
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            self.tickCount += 1
            print("Heartbeat \(self.tickCount) for user \(self.userID)")
        }
    }

    // CHANGE 2: Expose stop() and make deinit call it so the timer is always invalidated when the object is released, preventing the run loop from holding a dangling reference.
    func stop() {
        timer?.invalidate()
        timer = nil
    }

    deinit {
        stop()
        print("SessionManager deallocated")
    }
}
```

## Explanation

### Issue 1: Strong Capture of `self` in Timer Closure

**Problem:** `SessionManager` is never deallocated after logout. Instruments shows instances accumulating across login/logout cycles, and the `deinit` print statement never fires even after the coordinator sets its `sessionManager` property to `nil`.

**Fix:** Replace the bare `self` capture with `[weak self]` in the `Timer.scheduledTimer` closure, and add a `guard let self = self else { return }` guard at the top of the closure body.

**Explanation:** `Timer.scheduledTimer(withTimeInterval:repeats:block:)` retains its closure strongly. When the closure captures `self` without `[weak self]`, the closure holds a strong reference to the `SessionManager`. The `SessionManager` holds a strong reference to the `Timer` via its `timer` property. This forms a cycle: `SessionManager` → `Timer` → closure → `SessionManager`. Even after the coordinator drops its reference, neither object's reference count reaches zero, so ARC never frees them. Using `[weak self]` breaks the cycle: the closure holds only a weak reference to `SessionManager`, so when the coordinator's reference drops, the `SessionManager`'s count hits zero and ARC can deallocate it. The `guard let self = self` check then prevents any work from happening in the brief window between the timer firing and the object finishing teardown.

---

### Issue 2: Timer Not Invalidated on Deallocation Path

**Problem:** Even with the retain cycle fixed, if `stop()` is never called explicitly before logout, the repeating timer keeps firing indefinitely. The run loop holds the `Timer`, and the closure continues executing (though harmlessly after the weak-self fix, the timer itself wastes resources and can cause unexpected behavior).

**Fix:** Call `stop()` from inside `deinit` instead of duplicating `timer?.invalidate()` inline, ensuring the timer is always invalidated whenever the object is released for any reason.

**Explanation:** A repeating `Timer` added to the run loop stays scheduled until explicitly invalidated — it does not stop just because the object that created it goes away. In the original code, `deinit` calls `timer?.invalidate()` directly, which is correct but fragile: if someone adds another early-return path or the code evolves, the invalidation can be missed. Delegating to `stop()` means there is one authoritative teardown path. Callers who want to stop the timer early (e.g., on logout before deallocation) also call `stop()`, and `deinit` calls it again safely — `invalidate()` on an already-invalid timer is a no-op. This matters especially for repeating timers: unlike one-shot timers, they will never stop on their own, and a leaked repeating timer can keep calling into memory that has already been logically released.
