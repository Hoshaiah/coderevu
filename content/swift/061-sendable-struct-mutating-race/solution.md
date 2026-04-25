## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Mutating Struct Shared Across Tasks
// ------------------------------------------------------------------------

import Foundation

struct RequestMetrics {
    var requestID: UUID
    var durationMs: Double = 0
    var errorCount: Int = 0
    var statusCode: Int = 200
}

// CHANGE 3: Promote RequestPipeline to an `actor` so Swift enforces exclusive access to all stored properties, eliminating the data race without manual locking.
actor RequestPipeline {
    // CHANGE 2: Keeping `metrics` as a `var` is now safe because actor isolation guarantees only one task accesses it at a time.
    var metrics = RequestMetrics(requestID: UUID())

    func run() async {
        // CHANGE 1: Use `withTaskGroup` where each task returns its partial result instead of directly mutating shared state; the actor then applies updates serially after all tasks finish, removing concurrent mutation entirely.
        let results = await withTaskGroup(of: RequestMetrics.self) { group -> RequestMetrics in
            var accumulated = self.metrics

            group.addTask {
                // Simulate stage 1: return a metrics snapshot with durationMs set
                var m = RequestMetrics(requestID: accumulated.requestID)
                m.durationMs = 12.5
                return m
            }
            group.addTask {
                // Simulate stage 2: return a metrics snapshot with statusCode set
                var m = RequestMetrics(requestID: accumulated.requestID)
                m.statusCode = 201
                return m
            }
            group.addTask {
                // Simulate stage 3 (error path): return a metrics snapshot with errorCount set
                var m = RequestMetrics(requestID: accumulated.requestID)
                m.errorCount = 1
                return m
            }

            // CHANGE 1 (continued): Merge each task's partial result back on the actor's executor, serially.
            for await partial in group {
                accumulated.durationMs += partial.durationMs
                accumulated.errorCount += partial.errorCount
                if partial.statusCode != 200 {
                    accumulated.statusCode = partial.statusCode
                }
            }
            return accumulated
        }
        self.metrics = results
    }

    func report() {
        print("Request \(metrics.requestID): \(metrics.durationMs)ms, status \(metrics.statusCode), errors \(metrics.errorCount)")
    }
}
```

## Explanation

### Issue 1: Concurrent mutation of shared mutable state

**Problem:** Each spawned task reads and writes `self.metrics` — a single property living on the heap inside the `RequestPipeline` instance — at the same time. Under load you see corrupted totals (e.g., `durationMs` is zero) because one task overwrites a value another task just wrote before it could be used.

**Fix:** Each task now builds its own local `RequestMetrics` value and returns it. The `for await partial in group` loop (inside `withTaskGroup`) merges results serially on the actor's executor after every task has finished, replacing the concurrent writes with a single sequential update at `CHANGE 1`.

**Explanation:** Swift's `+=` on a `Double` or `Int` stored property of a class is not atomic. It compiles to a load, an arithmetic operation, and a store — three separate memory operations. Two tasks executing `self.metrics.durationMs += 12.5` concurrently can both load the same stale value, both add 12.5, and both store 12.5 instead of 25.0. The fix moves mutation out of the parallel region entirely: tasks only produce values, and the single serial merge loop applies them. The related pitfall is that `+=` on a local variable in a task closure is fine; it's only `self.someClassProperty` that crosses task boundaries unsafely.

---

### Issue 2: Struct value semantics don't protect class-stored properties

**Problem:** The team believed that because `RequestMetrics` is a `struct`, each task would work on its own copy. In production, error counts and timing values from one request sometimes appear in the next request's report, showing the assumption was wrong.

**Fix:** At `CHANGE 2`, the actor now owns `metrics` exclusively. Each task receives an independent local `RequestMetrics` value constructed inside the closure, so value-semantics copy-on-assign behavior works as expected within each task scope.

**Explanation:** Structs do give you independent copies — but only when you assign or pass them. When a closure captures `self` (a class instance) and then writes `self.metrics.durationMs`, it is not working on a copy of `metrics`; it is directly mutating the field through the class reference. The compiler synthesizes a getter/setter pair for `metrics`; the setter writes back through the reference, which is the same address in all tasks. The fix makes each task build a fresh local struct that it owns entirely, so mutations are isolated by construction, and the actor ensures the merge step is serial.

---

### Issue 3: No actor isolation on the pipeline class

**Problem:** `RequestPipeline` is a plain `class`, which Swift's structured concurrency treats as `Sendable`-unsafe shared mutable state. Thread Sanitizer fires data race warnings because nothing prevents two concurrent tasks from executing actor-unprotected code that touches `metrics` simultaneously.

**Fix:** At `CHANGE 3`, `RequestPipeline` is declared as an `actor` instead of a `class`. This makes all stored properties actor-isolated by default, and the Swift compiler enforces that mutations happen on the actor's serial executor.

**Explanation:** An `actor` in Swift is essentially a class with a built-in serial queue protecting its state. When a task calls a method on the actor, it suspends until the actor is free, runs the method exclusively, then allows the next waiter in. This means `self.metrics = results` at the end of `run()` can never overlap with another `run()` call or a concurrent `report()`. Changing the keyword from `class` to `actor` is a minimal change that integrates with Swift's concurrency model rather than adding manual locks, which are easy to forget or misplace. One pitfall: callers of `run()` and `report()` must now `await` those calls from outside the actor, but within the actor no `await` is needed for accessing `metrics` directly.
