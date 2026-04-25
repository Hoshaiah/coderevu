## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Sync Call Blocks MainActor
// ------------------------------------------------------------------------

import Foundation

@MainActor
final class ReportExporter {
    private let viewModel: ReportViewModel

    init(viewModel: ReportViewModel) {
        self.viewModel = viewModel
    }

    func export() async throws -> Data {
        // Read state from the view model (requires MainActor)
        let snapshot = viewModel.currentSnapshot()

        // CHANGE 1: Hop off the MainActor before running the blocking serialisation so the main thread is free during the 2-3 second CPU work.
        let data = try await Task.detached(priority: .userInitiated) {
            // CHANGE 1: LegacySerializer.toJSON runs here on a cooperative thread pool thread, not on the main thread.
            return LegacySerializer.toJSON(snapshot)
        }.value

        // CHANGE 2: Keep the file write off the MainActor as well, since data.write is blocking I/O that would otherwise stall the main thread.
        let url = try await Task.detached(priority: .userInitiated) {
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("report.json")
            try data.write(to: url)
            return url
        }.value

        return data
    }
}
```

## Explanation

### Issue 1: Blocking CPU Work on MainActor

**Problem:** The user sees the app UI freeze for 2–3 seconds whenever they trigger an export. `LegacySerializer.toJSON` is a synchronous, CPU-intensive call and runs entirely on the main thread because `export()` is pinned to `@MainActor`.

**Fix:** Wrap `LegacySerializer.toJSON(snapshot)` in a `Task.detached(priority: .userInitiated)` block and `await` its `.value`. This is the CHANGE 1 site — the call moves from executing inline on the main thread to executing on the Swift cooperative thread pool.

**Explanation:** `async` only means the function can suspend at `await` points; it does not automatically move synchronous code off the actor it is isolated to. Because the class is `@MainActor`, every line of `export()` that is not explicitly suspended runs on the main thread. `LegacySerializer.toJSON` has no `await` and therefore never yields, so it monopolises the main thread for its full duration. `Task.detached` creates a new task with no actor inheritance, so the closure runs on a background thread in the cooperative pool. The `await .value` suspension point lets the main thread return to its run loop while waiting, keeping the UI responsive. A related pitfall: using `Task { }` (non-detached) instead of `Task.detached` would inherit the current actor and put the work back on the main thread, so `detached` is required here.

---

### Issue 2: Blocking File I/O on MainActor

**Problem:** `data.write(to: url)` is a synchronous file-system call. Even after fixing the serialisation step, this call still runs on the main thread because it sits in the same `@MainActor`-isolated function body without any suspension before it.

**Fix:** Move the `FileManager` directory lookup and `data.write(to: url)` call inside a second `Task.detached(priority: .userInitiated)` block at the CHANGE 2 site, awaiting its `.value` to get the resulting URL back on the MainActor.

**Explanation:** File writes go through the kernel and can block for a measurable amount of time, especially on spinning disks or when the temp directory is on a network volume. Because the function is `@MainActor`, any synchronous call in its body blocks the main thread. Offloading to `Task.detached` gives the same benefit as for the serialisation: the cooperative thread pool thread blocks on I/O while the main thread remains free. The snapshot value captured by the detached closure is a value type (it came from `viewModel.currentSnapshot()`), so there is no actor-isolation violation when accessing it from the background task.
