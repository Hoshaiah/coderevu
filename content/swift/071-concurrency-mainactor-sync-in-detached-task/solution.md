## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Synchronous MainActor Call in Detached Task
// ------------------------------------------------------------------------

class ReportExporter {
    @MainActor
    func exportReport(dateRange: ClosedRange<Date>) {
        let range = dateRange

        // CHANGE 1: Read all main-actor state HERE, before entering the detached task, so the main actor is free once the task runs and `await MainActor.run` inside can never deadlock.
        let title = UIApplication.shared.windows.first?.rootViewController?.title ?? "Report"

        // CHANGE 2: Capture `self` explicitly with `[self]` so ownership intent is clear and the compiler enforces it in the detached (non-isolated) closure.
        Task.detached(priority: .userInitiated) { [self] in
            let pdfData = generatePDF(range: range, title: title)

            // Save result back on main actor
            await MainActor.run {
                self.savePDF(pdfData)
            }
        }
    }

    private func generatePDF(range: ClosedRange<Date>, title: String) -> Data {
        // Heavy synchronous work
        return Data()
    }

    @MainActor
    private func savePDF(_ data: Data) {
        // Write to disk and update UI
    }
}
```

## Explanation

### Issue 1: Deadlock from `MainActor.run` Inside Detached Task

**Problem:** Tapping the Export button freezes the app permanently. The app never crashes and generates no logs — it just stops responding. Execution reaches the `Task.detached` block but never moves past the first `await MainActor.run` call inside it.

**Fix:** Move the `UIApplication.shared.windows…` read to the body of `exportReport`, which already runs on the main actor, and capture the resulting `title` value as a plain `String` into the detached task. The `await MainActor.run` call that fetched the title is deleted entirely.

**Explanation:** `exportReport` is marked `@MainActor`, so when the toolbar button calls it, the main actor is active for the duration of that call. `Task.detached` schedules a new task on a background thread, but the *original* call to `exportReport` does not `await` that task — it returns immediately while the detached task runs concurrently. However, on-device Swift concurrency uses a cooperative thread pool. When the detached task reaches `await MainActor.run { … }`, it enqueues work on the main actor and suspends, waiting for the main actor to pick it up. If the main actor is not free — for example if the UIKit run loop is spinning waiting for something that is in turn waiting for the detached task — the main actor never drains that enqueued work and both sides wait forever. In the buggy code the deadlock is more subtle: reading `UIApplication.shared.windows` synchronously from inside `MainActor.run` on certain iOS versions requires the main thread to be idle, and the cooperative scheduler cannot preempt a synchronous call already occupying the main actor. Moving the read to before the task is spawned means the main actor is idle by the time the detached task's later `await MainActor.run { self.savePDF(pdfData) }` executes, so that call succeeds correctly.

---

### Issue 2: Implicit `self` Capture in `Task.detached` Closure

**Problem:** The `Task.detached` closure captures `self` implicitly. The Swift compiler allows this but it silently creates a strong reference to `self` with no indication of intended lifetime or ownership, which can mask retain cycles and makes code review harder.

**Fix:** Add `[self]` as an explicit capture list on the `Task.detached` trailing closure, changing `Task.detached(priority: .userInitiated) {` to `Task.detached(priority: .userInitiated) { [self] in`.

**Explanation:** Unlike structured `Task { }` closures (which inherit actor isolation and have explicit `self` requirements), `Task.detached` closures are non-isolated and the compiler does not force you to write a capture list. An implicit strong capture of `self` inside a long-lived background task keeps the `ReportExporter` alive for the entire duration of the PDF generation, potentially longer than the object's intended lifetime. Writing `[self]` makes the capture visible in code review, lets you change it to `[weak self]` if the exporter should not block deallocation, and satisfies Swift's `Sendable` checking rules for detached tasks more explicitly. A related pitfall: if you later add an `unowned` capture here incorrectly, the crash will happen on the background thread with no useful stack — using `weak self` with a guard is safer if the exporter can be deallocated before the task finishes.
