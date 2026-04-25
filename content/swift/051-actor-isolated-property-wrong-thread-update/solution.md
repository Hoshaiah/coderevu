## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Actor Property Updated Off-Actor
// ------------------------------------------------------------------------

actor OrderProcessor {
    private(set) var totalRevenue: Decimal = 0
    private(set) var failedOrderIDs: [String] = []

    init() {
        NotificationCenter.default.addObserver(
            forName: .orderCancelled,
            object: nil,
            queue: nil
        ) { [weak self] notification in
            guard let self,
                  let id = notification.userInfo?["orderID"] as? String else { return }
            // CHANGE 1: Dispatch the mutation through a `Task` so it runs on the actor's executor, satisfying Swift actor-isolation rules and eliminating the data race.
            Task { await self.markFailed(orderID: id) }
        }
    }

    func process(order: Order) async throws {
        let charged = try await PaymentGateway.shared.charge(order)
        totalRevenue += charged
    }

    func markFailed(orderID: String) {
        failedOrderIDs.append(orderID)
    }
}
```

## Explanation

### Issue 1: NotificationCenter Closure Bypasses Actor Isolation

**Problem:** The `NotificationCenter` callback closure captures `self` (the actor) and directly writes to `self.failedOrderIDs` without hopping onto the actor's executor. At runtime, the closure fires on whatever thread `NotificationCenter` chooses — often a random NIO thread — while the actor may be executing other work. TSan sees two threads touching the same memory without synchronisation and reports a data race. The symptom is duplicate or missing entries in `failedOrderIDs`.

**Fix:** Replace the direct `self.failedOrderIDs.append(id)` call inside the closure with `Task { await self.markFailed(orderID: id) }`. This is the `// CHANGE 1` site. The `Task` schedules the call on the actor's own executor, so the mutation is serialised correctly.

**Explanation:** Swift actors guarantee isolation only when code runs on the actor's executor — that is, when it is reached via an `async` call or from within another actor-isolated function. A synchronous closure handed to `NotificationCenter` does not cross that boundary; Swift simply cannot insert the required executor hop. Even though `self` is an actor, calling `self.failedOrderIDs.append(id)` synchronously inside the closure is equivalent to calling it from any arbitrary thread, which is exactly the race TSan flags. Wrapping the call in `Task { await self.markFailed(orderID: id) }` creates an unstructured task that is bound to the actor's isolation domain because `self` is the actor — Swift infers the task's actor context from the `await` target. This means the append is queued behind any in-flight actor work and executes atomically with respect to other actor methods. A related pitfall: using `DispatchQueue.main.async { self.failedOrderIDs.append(id) }` instead would move the work to the main queue but would still race if the actor is not main-actor-isolated, which it is not here.

---
