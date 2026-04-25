## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Nonisolated Mutation of Shared Array
// ------------------------------------------------------------------------

import Foundation

typealias EventHandler = (String) -> Void

actor EventBus {
    private var subscribers: [UUID: EventHandler] = [:]

    func subscribe(handler: @escaping EventHandler) -> UUID {
        let id = UUID()
        subscribers[id] = handler
        return id
    }

    func remove(id: UUID) {
        subscribers.removeValue(forKey: id)
    }

    func publish(event: String) {
        // CHANGE 2: Snapshot handlers first, then dispatch outside actor isolation so a handler that calls back into the actor (e.g. remove) does not deadlock and the actor is not blocked for the duration of all callbacks.
        let handlers = Array(subscribers.values)
        Task.detached {
            handlers.forEach { $0(event) }
        }
    }

    // CHANGE 1: Removed `nonisolated` keyword and made `count` an isolated async-compatible property; callers must now use `await bus.count` which is safe because access is serialized by the actor.
    var count: Int {
        subscribers.count
    }
}
```

## Explanation

### Issue 1: `nonisolated` Bypasses Actor Serialization

**Problem:** The `nonisolated var count` property reads `subscribers.count` directly, without going through the actor's serial executor. Any thread can call `count` at the same moment another thread is inside `subscribe` or `remove` mutating `subscribers`, producing a data race. Thread Sanitizer reports this, and on multi-core devices it manifests as crashes (`EXC_BAD_ACCESS`) or wrong counts.

**Fix:** Remove the `nonisolated` keyword from `count` so the property becomes actor-isolated. Call sites change from `bus.count` to `await bus.count`. The `nonisolated` modifier is removed at the CHANGE 1 site.

**Explanation:** Swift actors protect stored state by routing all access through a serial executor — only one piece of code runs on the actor at a time. `nonisolated` opts a member out of that protection, telling the compiler "this is safe to call from any context without the executor". That is only valid when the member does not touch actor-isolated state. Reading `subscribers.count` is a read of actor-isolated state, so `nonisolated` is wrong here. The compiler normally catches this, but before Swift 5.10 certain property accesses were not rejected. Removing `nonisolated` makes callers use `await`, which routes the call through the actor's executor and serializes it with all mutations.

---

### Issue 2: Actor Held While Invoking External Closures

**Problem:** The original `publish` iterates `subscribers.values` and calls each handler while the actor is isolated to the current task. If any handler calls `bus.remove(id:)` or `bus.subscribe(handler:)` — both of which are `async` actor methods — the actor will attempt to re-enter itself, causing a deadlock on the calling task. Even without re-entry, all handler work blocks the actor from processing other messages for its entire duration.

**Fix:** At the CHANGE 2 site, `publish` first snapshots `subscribers.values` into a local `[EventHandler]` array, then dispatches the calls inside a `Task.detached` block so the actor is free before any handler runs.

**Explanation:** Swift actors are not re-entrant by default. When `publish` holds the actor and a handler tries to `await bus.remove(id:)`, that `await` suspends the handler waiting for the actor — but the actor is busy inside `publish` waiting for the handler. Neither side makes progress. Snapshotting the handlers copies the closures into a local array that is not actor-isolated; releasing the actor before calling them breaks the cycle. `Task.detached` ensures the handlers run on the cooperative thread pool rather than on the actor's executor, so multiple events can be in flight concurrently without queuing behind each other on the actor. A related pitfall: the snapshot must be taken inside the actor (before the detached task) so the read of `subscribers` is still serialized.
