## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Synchronous Blocking on MainActor
// ------------------------------------------------------------------------

import Foundation
import UIKit

@MainActor
class DocumentExporter {
    var isExporting = false

    func exportDocument(_ document: Document) async throws {
        isExporting = true
        defer { isExporting = false }

        let data = document.render() // fast, in-memory

        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString + ".pdf")

        // CHANGE 1: Hop off the MainActor for the blocking file write so the UI thread stays responsive; nonisolated closure runs on a cooperative thread pool thread.
        try await Task.detached(priority: .userInitiated) {
            try data.write(to: tempURL, options: .atomic)
        }.value

        // CHANGE 2: Guard against a nil rootViewController before presenting; silently dropping the share sheet left users with no feedback that export succeeded.
        guard let rootVC = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first?
            .windows.first?
            .rootViewController else { return }

        let activityVC = UIActivityViewController(
            activityItems: [tempURL],
            applicationActivities: nil
        )
        rootVC.present(activityVC, animated: true)
    }
}
```

## Explanation

### Issue 1: Blocking File Write on Main Thread

**Problem:** When the user taps "Export", the app UI freezes until `data.write(to:options:)` returns. For large documents this can take several seconds, long enough to trigger the iOS watchdog and display the app-not-responding dialog. Buttons stop responding and animations stall because the main run loop is blocked.

**Fix:** Replace the direct `data.write(to:options:)` call with `try await Task.detached(priority: .userInitiated) { try data.write(to: tempURL, options: .atomic) }.value`, which moves the write off the `MainActor` and suspends the caller until it completes without blocking the main thread.

**Explanation:** `@MainActor` ensures all code in `exportDocument` runs on the main thread by default. `Data.write(to:options:)` is a synchronous blocking syscall — it holds the thread until every byte is flushed to disk. Because the main thread is held, UIKit's run loop cannot process touch events or advance animations. `Task.detached` spawns a new task that is not bound to the `MainActor`, so the write executes on a Swift concurrency thread-pool thread. `await .value` suspends the `@MainActor` function at that point (releasing the main thread to handle UI events) and resumes it only after the write finishes. Note that `tempURL` must be a value type (`URL` is a struct) to safely capture across actor boundaries without a race.

---

### Issue 2: Silent Drop When rootViewController Is Nil

**Problem:** If `windows.first?.rootViewController` is `nil` — which can happen during state restoration, when a scene is disconnecting, or on iPad with multiple windows — the `present` call is sent to `nil` via optional chaining, the share sheet never appears, and the user gets no feedback that the export finished.

**Fix:** Replace the optional-chained `scene?.windows.first?.rootViewController?.present(...)` with a `guard let rootVC = ...` that extracts the root view controller and returns early if it is missing, then calls `rootVC.present(activityVC, animated: true)` unconditionally on the unwrapped value.

**Explanation:** Swift optional chaining silently no-ops when any link in the chain is `nil`. There is no compiler warning and no runtime error, so the bug is invisible during development on a device that always has a window. In production, scene lifecycle events (backgrounding, split-screen on iPad, app extensions) can leave `rootViewController` transiently nil. The `guard` makes the nil case explicit: the function returns early and `isExporting` is correctly reset by `defer`. A more robust version might throw an error or post a notification so the caller can show a user-facing message, but the guard is the minimum fix to prevent a silent failure.
