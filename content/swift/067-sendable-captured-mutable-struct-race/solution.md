## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Mutable Struct Captured Across Actor Boundary
// ------------------------------------------------------------------------

// CHANGE 1: Mark SyncPayload as Sendable so the compiler enforces safe cross-actor value copying and closes the implicit capture loophole.
struct SyncPayload: Sendable {
    var entries: [String: String]
    var timestamp: Date
    var auditTag: String?
}

actor SyncUploader {
    func upload(_ payload: SyncPayload) async {
        // Simulated async upload work
        try? await Task.sleep(nanoseconds: 100_000_000)
        print("Uploaded \(payload.entries.count) entries at \(payload.timestamp)")
    }
}

class SyncCoordinator {
    private let uploader = SyncUploader()

    func sync(entries: [String: String]) {
        var payload = SyncPayload(entries: entries, timestamp: Date(), auditTag: nil)
        // CHANGE 2: Capture an immutable snapshot of payload in the Task closure so that subsequent mutations to the local var cannot affect what the actor receives.
        let uploadSnapshot = payload
        Task {
            await uploader.upload(uploadSnapshot)
        }
        // Safe to mutate payload now; the actor holds its own independent copy via uploadSnapshot.
        payload.auditTag = "coordinator-v2"
        logPayload(payload)
    }

    private func logPayload(_ payload: SyncPayload) {
        print("Logged: \(payload.auditTag ?? "none")")
    }
}
```

## Explanation

### Issue 1: Missing Sendable Conformance on Value Type

**Problem:** `SyncPayload` has no `Sendable` conformance. Under `-strict-concurrency=complete`, Swift requires any type crossing an actor or Task boundary to be `Sendable`. Without it, the compiler cannot verify that the value is safely copied rather than shared, and the Thread Sanitizer reports a race on `timestamp` and `entries` because the struct's internal storage can be mutated concurrently.

**Fix:** Add `: Sendable` to the `SyncPayload` declaration (the `// CHANGE 1` site). Because all stored properties (`[String: String]`, `Date`, `String?`) are themselves `Sendable`, the compiler accepts this conformance with no further changes.

**Explanation:** Swift's concurrency model uses `Sendable` as the gate for safe cross-boundary transfer. A struct without `Sendable` is not automatically treated as safe just because it is a value type — the compiler only knows it is safe when you assert it via `Sendable`. Under `-strict-concurrency=targeted` the compiler silently allows the pass-through, which is why the bug compiles cleanly; under `complete` it flags it. The Thread Sanitizer catches the runtime consequence: the `Task` is scheduled but not yet running, so the caller's mutation of `payload.auditTag` races with the Task reading `payload.entries` the moment the actor thread wakes up. Making the type `Sendable` is a necessary precondition, but alone it does not prevent Issue 2.

---

### Issue 2: Mutable Local Captured by Task Closure

**Problem:** The `Task` closure captures `payload` as the same `var` that the caller continues to mutate immediately after creating the Task. Even though structs are value types, Swift closures that capture a `var` share the variable's storage (via a heap-allocated box) rather than snapshotting its value at capture time. This means `payload.auditTag = "coordinator-v2"` can write into the same box that the Task reads from, producing the race.

**Fix:** At the `// CHANGE 2` site, copy `payload` into a new `let` binding (`uploadSnapshot`) before creating the Task, then capture `uploadSnapshot` in the closure instead of `payload`. A `let` binding cannot be mutated, so the Task always sees the value from the moment the snapshot was taken.

**Explanation:** When a Swift closure captures a `var`, it wraps that variable in a reference-counted box so the closure and the surrounding scope share exactly one copy. Assigning to `payload` after the `Task { }` block writes through that box. If the actor thread hasn't dequeued the message yet, both threads touch the same memory simultaneously — a data race even though `SyncPayload` is a struct. Capturing a `let` instead breaks the sharing: the `let` is given its own independent copy of the struct's value at assignment time, and nothing can mutate it afterward. A related pitfall: if `SyncPayload` contained a reference type (e.g., an `NSMutableDictionary`), copying the struct would only copy the reference, so both copies would still share mutable state — which is exactly why `Sendable` conformance (Issue 1) must also be enforced, to prevent such types from slipping through.
