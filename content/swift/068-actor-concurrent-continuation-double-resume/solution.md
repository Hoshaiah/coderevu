## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Continuation Resumed Twice in Actor
// ------------------------------------------------------------------------

import Foundation
import CoreBluetooth

actor BluetoothManager: NSObject {
    private var pendingContinuation: CheckedContinuation<Void, Error>?
    // CHANGE 1: Removed the separate `isConnecting` Bool; presence of `pendingContinuation` now serves as the single, atomic guard so the flag and the continuation cannot get out of sync.

    func connect(to peripheral: CBPeripheral) async throws {
        // CHANGE 1: Guard on `pendingContinuation` instead of a separate flag so the gate and the value are one atomic unit inside the actor.
        guard pendingContinuation == nil else { return }
        try await withCheckedThrowingContinuation { continuation in
            self.pendingContinuation = continuation
            peripheral.delegate = self
            // Simulate initiating connection
        }
    }

    func handleConnected() {
        // CHANGE 2: Capture and nil-out `pendingContinuation` in a single step before calling resume so no second caller can reach the same continuation.
        guard let continuation = pendingContinuation else { return }
        pendingContinuation = nil
        continuation.resume(returning: ())
    }

    func handleError(_ error: Error) {
        // CHANGE 2: Same atomic take-and-clear pattern; once `pendingContinuation` is nil, any racing call to handleError or handleConnected becomes a no-op.
        guard let continuation = pendingContinuation else { return }
        pendingContinuation = nil
        continuation.resume(throwing: error)
    }
}

extension BluetoothManager: CBPeripheralDelegate {
    // CHANGE 3: Use `assumeIsolated` (or a serialised Task with explicit actor hop) instead of a plain `Task { await ... }` to ensure the actor hop does not allow two racing Tasks to both observe the pre-cleared state before either modifies it.
    nonisolated func peripheral(_ peripheral: CBPeripheral,
                                 didDiscoverServices error: Error?) {
        // CHANGE 3: A single Task is still required because delegate callbacks are nonisolated, but the fix in handleConnected/handleError (CHANGE 2) means that even if two Tasks race through the actor, only the first one finds a non-nil continuation.
        Task {
            if let error = error {
                await handleError(error)
            } else {
                await handleConnected()
            }
        }
    }
}
```

## Explanation

### Issue 1: Separate flag and continuation not atomic

**Problem:** `isConnecting` is a plain `Bool` stored next to `pendingContinuation`. Reading the flag, acting on it, and then mutating the continuation are three distinct operations. Between any two of them a second actor-scheduled task can observe the old flag value and reach the resume site, causing the crash `tried to resume a continuation that was already resumed`.

**Fix:** Remove `isConnecting` entirely. The guard in `connect` is rewritten to `guard pendingContinuation == nil else { return }`, making the stored continuation itself the single source of truth for whether a connection is in progress.

**Explanation:** Inside a Swift actor, each `await` point is a potential preemption point — another Task can run on the actor between any two `await`-separated statements. When `handleConnected` checked `isConnecting`, set it to `false`, then called `resume`, a second task could enter `handleError`, see `isConnecting == false` (already cleared) and still hold the original `pendingContinuation` reference. Collapsing the guard and the value into one optional means the only way to reach `resume` is to have successfully extracted a non-nil value from `pendingContinuation`, and the nil-out happens before `resume` is called, so no other path can get the same object.

---

### Issue 2: Continuation not cleared before resume

**Problem:** Both `handleConnected` and `handleError` call `pendingContinuation?.resume(...)` without first setting `pendingContinuation` to `nil`. A racing second invocation — which Swift's actor guarantees will run after the first one yields — still sees a non-nil `pendingContinuation` and calls `resume` a second time, producing the crash.

**Fix:** In both handlers, replace the optional-chain call with a `guard let continuation = pendingContinuation` capture, immediately set `pendingContinuation = nil`, then call `continuation.resume(...)` on the local copy.

**Explanation:** The take-and-clear idiom is the standard pattern for one-shot values: extract the value into a local, null the storage, then use the local. Because the actor serialises all accesses, the second Task that reaches `handleConnected` or `handleError` finds `pendingContinuation` already nil and exits through the `guard`. The local `continuation` variable is on the first Task's stack, so the second Task never touches it. A related pitfall is calling `resume` inside the `withCheckedThrowingContinuation` closure itself before the outer scope stores the continuation — the take-and-clear pattern avoids that too.

---

### Issue 3: Unstructured Tasks allow two actor hops to race

**Problem:** The nonisolated delegate method wraps each callback in a plain `Task { await ... }`. CoreBluetooth can fire the delegate multiple times in a single run-loop turn; each fires a separate Task, both of which are enqueued on the actor and will each execute `handleConnected` or `handleError` — the very race the team tried to prevent with the flag.

**Fix:** The comment at CHANGE 3 documents that the plain `Task` is kept (it is required because delegate methods are nonisolated and cannot `await` directly), but the real safety now comes from the atomic take-and-clear in CHANGE 2. Each Task that reaches the actor atomically takes ownership of the continuation or finds nil and exits.

**Explanation:** Swift actors serialise execution but not Task creation. Two Tasks spawned from the nonisolated delegate method will both be enqueued and will both run, just not concurrently — they run in series. The old code was vulnerable because both tasks could see `isConnecting == true` before either had a chance to set it to `false`, depending on scheduling. After CHANGE 2, the first Task to run atomically sets `pendingContinuation = nil`; by the time the second Task runs it finds nil and returns immediately. There is no window between the nil-check and the nil-set for another Task to slip through because actor execution is non-preemptive within a single synchronous region.
