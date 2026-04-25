---
slug: actor-isolated-continuation-resume-missing
track: swift
orderIndex: 53
title: "Actor Continuation Never Resumed"
difficulty: medium
tags: ["concurrency", "actor", "async-await"]
language: swift
---

## Context

`PurchaseActor.swift` serialises in-app purchase validation requests so that only one can be in flight at a time. It bridges a callback-based StoreKit observer into `async/await` using `withCheckedContinuation`. The actor was introduced to replace a serial `DispatchQueue` wrapper and passes code review because the pattern looks textbook.

Users occasionally report that the "Buy" button freezes indefinitely after a failed purchase attempt — specifically when the App Store returns an error that the team classifies as a "user-cancelled" event. The button never re-enables, and restarting the app fixes it. No crash, no log error.

The team added logging before and after the continuation and confirmed that the actor receives the cancellation callback, but the `async` caller of `validate()` never returns. The issue only surfaces on the cancellation path; successful purchases work fine.

## Buggy code

```swift
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
            // User tapped Cancel — not a real error, just ignore
            return
        }
        Task {
            await self.resume(with: .failure(error))
        }
    }

    private func resume(with result: Result<Bool, Error>) {
        pendingContinuation?.resume(with: result)
        pendingContinuation = nil
    }
}
```
