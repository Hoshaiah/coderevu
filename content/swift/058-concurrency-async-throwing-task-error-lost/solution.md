## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Thrown Error Silently Dropped in Task
// ------------------------------------------------------------------------

class UploadService {
    func beginUpload(data: Data,
                     onSuccess: @escaping () -> Void,
                     onError: @escaping (Error) -> Void) {
        Task {
            // CHANGE 1: Wrap the throwing call in do/catch so errors are forwarded to onError instead of being silently dropped when the Task exits.
            do {
                try await performUpload(data: data)
                await MainActor.run { onSuccess() }
            } catch {
                // CHANGE 2: Dispatch the error callback on MainActor so UI updates (alerts, spinner removal) are safe to perform inside onError.
                await MainActor.run { onError(error) }
            }
        }
    }

    private func performUpload(data: Data) async throws {
        let (_, response) = try await URLSession.shared.upload(
            for: URLRequest(url: URL(string: "https://api.example.com/upload")!),
            from: data
        )
        guard let http = response as? HTTPURLResponse,
              (200..<300).contains(http.statusCode) else {
            throw UploadError.serverError
        }
    }
}

enum UploadError: Error {
    case serverError
}
```

## Explanation

### Issue 1: Thrown Errors Silently Discarded in Task

**Problem:** When `performUpload` throws — because the server returns a 4xx or 5xx status — the error propagates out of the `Task` body and is silently consumed by the Swift concurrency runtime. The `onError` closure is never called, the spinner never stops, and the user sees nothing.

**Fix:** Wrap `try await performUpload(data: data)` and the `onSuccess()` call inside a `do/catch` block. In the `catch` branch, call `onError(error)` so the caller receives the failure.

**Explanation:** A `Task` that is created without storing its handle (a "fire-and-forget" task) has no external observer waiting on its result. When a `try` expression inside such a task throws and nothing catches it, Swift marks the task as failed and discards the error — there is no crash, no log, nothing. Adding `do/catch` intercepts the error before it escapes the task body, giving you a place to invoke the callback. A related pitfall: if you later add `Task.detached` instead of `Task`, the behavior is the same — the error is still dropped without a catch.

---

### Issue 2: Error Callback Not Dispatched on MainActor

**Problem:** The `onSuccess` path already uses `await MainActor.run { onSuccess() }`, but before this fix there was no error path at all. If `onError` is added without the `MainActor.run` wrapper, the callback fires on whatever thread the Swift concurrency executor assigns to the task, which is not guaranteed to be the main thread. Callers that update UIKit inside `onError` — showing an alert, hiding a spinner — would trigger UI work off the main thread.

**Fix:** Wrap the `onError(error)` call in `await MainActor.run { onError(error) }`, mirroring how `onSuccess` is already dispatched.

**Explanation:** `URLSession` continuation resumptions and async task scheduling in Swift concurrency do not guarantee execution on the main thread unless explicitly requested. `onSuccess` was correctly guarded with `MainActor.run`, but the catch branch needs the same treatment. Without it, a caller that calls `self.present(alertController, ...)` inside `onError` races with the main thread, causing either a runtime warning or a crash. Wrapping with `MainActor.run` suspends the task, hops to the main actor's serial executor, runs the closure, and then returns — making it safe for any UIKit work the caller wants to do.
