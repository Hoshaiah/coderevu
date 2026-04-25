## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Synchronous Actor Access Deadlock
// ------------------------------------------------------------------------

import Foundation

actor OrderActor {
    private var queue: [Order] = []

    func enqueue(_ order: Order) {
        queue.append(order)
    }

    func processAll() async -> [Order] {
        let pending = queue
        queue.removeAll()
        return pending
    }
}

struct Order { let id: UUID; let amount: Double }

@MainActor
class OrderProcessorViewModel: ObservableObject {
    @Published var processedCount: Int = 0
    private let actor = OrderActor()

    // CHANGE 1 & 2: Mark the function `async` and await the actor directly instead of using a DispatchSemaphore to block the main thread, eliminating the deadlock and correctly suspending rather than blocking.
    func processTapped() async {
        // CHANGE 1: Removed DispatchSemaphore and the nested Task; awaiting the actor directly suspends this @MainActor function without blocking the thread, so the Swift runtime can schedule the actor work freely.
        let results = await actor.processAll()
        processedCount += results.count
    }
}
```

## Explanation

### Issue 1: Semaphore Deadlock on Main Thread

**Problem:** Tapping "Process Orders" makes the UI freeze immediately and the Watchdog kills the app with `0x8badf00d` after a few seconds. The main thread is blocked indefinitely inside `processTapped()` and never processes any more events.

**Fix:** Remove `DispatchSemaphore` and the nested `Task` entirely. Replace them with a direct `await actor.processAll()` call at the `CHANGE 1` site. The result is assigned to `results` on the same line without any blocking primitive.

**Explanation:** `semaphore.wait()` blocks the main thread — it puts the thread to sleep at the OS level and refuses to let any other work run on it. The `Task` that was spawned to call `await actor.processAll()` is part of Swift's cooperative thread pool and needs to hop back onto the main actor to complete and call `semaphore.signal()`. Because the main actor is pinned to the main thread, and that thread is asleep waiting on the semaphore, neither side can make progress. This is a classic thread-level deadlock, not a data-level one. Marking `processTapped()` as `async` and using `await` directly lets Swift suspend the function cooperatively — the main thread is released to do other work while the actor processes orders, then execution resumes on the main actor once the result is ready. A related pitfall: this same pattern breaks with `DispatchGroup.wait()`, `NSCondition.wait()`, or any other blocking wait called from a context that owns an actor executor.

---

### Issue 2: Non-async Function Cannot Legally Await Actor Work

**Problem:** `processTapped()` is not marked `async`, so the compiler rejects a bare `await` call inside it. The original code works around this by spawning a `Task`, but that introduces the semaphore deadlock described above.

**Fix:** Add `async` to the function signature at the `CHANGE 2` site (same line as `CHANGE 1` in the solution: `func processTapped() async`). The SwiftUI call-site that invokes this method (e.g., a button action) must itself use `Task { await viewModel.processTapped() }` to bridge into the async world.

**Explanation:** Swift's structured concurrency requires that any function using `await` be marked `async`, so the compiler can insert the suspension points and manage the continuation. Without `async`, the only escape hatch is to spin up a `Task`, which runs concurrently and requires manual synchronization — exactly what caused the deadlock. Making the method `async` keeps the sequential logic intact: the function suspends at `await actor.processAll()`, the actor runs its work, and the function resumes on the main actor to update `processedCount`. The `@MainActor` annotation is preserved, so the UI update is still guaranteed to happen on the main thread. Callers that are already in an async context (e.g., another `async` method or a `Task` block in the SwiftUI view) can simply `await processTapped()` without any extra ceremony.
