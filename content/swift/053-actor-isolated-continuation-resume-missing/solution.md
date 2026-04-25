## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Actor Continuation Never Resumed
// ------------------------------------------------------------------------

actor PurchaseActor {
    private var pendingContinuation: CheckedContinuation<Bool, Error>?

    func validate(productID: String) async throws -> Bool {
        return try await withCheckedThrowingContinuation { continuation in
            self.pendingContinuation = continuation
            StoreKitBridge.shared.beginPurchase(productID: productID)
        }
    }

    // Called by StoreKitBridge delegate (on an arbitrary queue)
    nonisolated func purchaseDidSucceed() {
        Task {
            await self.resume(with: .success(true))
        }
    }

    nonisolated func purchaseDidFail(error: Error) {
        if (error as? SKError)?.code == .paymentCancelled {
            // CHANGE 1: Resume the continuation with success(false) instead of silently returning, so the caller is never left suspended.
            Task {
                await self.resume(with: .success(false))
            }
            return
        }
        Task {
            await self.resume(with: .failure(error))
        }
    }

    private func resume(with result: Result<Bool, Error>) {
        // CHANGE 2: Guard that the continuation is non-nil before resuming; avoids a double-resume crash if callbacks arrive more than once.
        guard let continuation = pendingContinuation else { return }
        pendingContinuation = nil
        continuation.resume(with: result)
    }
}
```

## Explanation

### Issue 1: Cancellation path never resumes continuation

**Problem:** When the App Store calls `purchaseDidFail` with a `paymentCancelled` error, the function returns immediately without touching the continuation. The `async` caller of `validate()` is now suspended on a continuation that will never be resumed. The "Buy" button never re-enables, and only an app restart clears the deadlock.

**Fix:** Replace the bare `return` inside the `paymentCancelled` branch with a `Task { await self.resume(with: .success(false)) }` call before returning, matching the same dispatch pattern used for other outcomes. This signals the caller that the purchase did not complete (returning `false`) without treating cancellation as a thrown error.

**Explanation:** `withCheckedThrowingContinuation` hands the caller a token that the Swift runtime expects to be resumed exactly once. If the code path that holds that token exits without calling `resume`, the runtime parks the task indefinitely — there is no timeout and no automatic cleanup. The `paymentCancelled` branch was written with the intent of "silently ignoring" user cancellation, but that logic belongs at the call site, not inside the actor. Returning `false` is the right signal: the purchase did not happen, it was not an error, and the caller can decide whether to show UI. A related pitfall is throwing a `CancellationError` instead — that works too, but requires callers to catch and filter it, which is more intrusive.

---

### Issue 2: Double-resume guard missing in `resume` helper

**Problem:** The original `resume` method calls `pendingContinuation?.resume(with:)` and then sets the property to `nil`. If `resume` were somehow called twice before the first `Task` finishes executing on the actor (e.g., both `purchaseDidSucceed` and `purchaseDidFail` fire due to a buggy delegate), the second call would resume an already-resumed continuation, which is a runtime error that terminates the process with a `"continuation was already resumed"` trap in debug builds and undefined behavior in release.

**Fix:** Replace the optional-chaining call with a `guard let continuation = pendingContinuation else { return }` check, set `pendingContinuation = nil` before calling `continuation.resume(with:)`, and then call resume on the local constant. This makes the method idempotent and closes the nil-before-resume window.

**Explanation:** Setting the stored property to `nil` before resuming (rather than after) is important because `resume` itself may synchronously re-enter actor-isolated code in some runtime configurations. Holding the continuation in a local constant first ensures the stored slot is cleared regardless of what happens during or after the resume call. The `guard` exit on `nil` means a second spurious callback is silently ignored rather than crashing. This is the standard safe-resume pattern for actor-owned continuations.
