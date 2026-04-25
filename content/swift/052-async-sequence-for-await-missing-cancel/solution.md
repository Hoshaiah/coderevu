## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — AsyncSequence Loop Never Terminates
// ------------------------------------------------------------------------

class LiveFeedManager {
    private let task: URLSessionWebSocketTask
    var onScore: ((ScoreUpdate) -> Void)?
    // CHANGE 3: store the Task so it can be explicitly cancelled in stop(), giving us a reliable cancellation path
    private var feedTask: Task<Void, Never>?

    init(url: URL) {
        task = URLSession.shared.webSocketTask(with: url)
    }

    func start() {
        task.resume()
        // CHANGE 1: capture `self` weakly so the Task does not extend the lifetime of LiveFeedManager
        feedTask = Task { [weak self] in
            guard let self else { return }
            for await message in self.webSocketMessages() {
                // CHANGE 1 (continued): guard again on each iteration so we stop processing if self is gone
                guard let self else { break }
                if let update = ScoreUpdate(message) {
                    self.onScore?(update)
                }
            }
        }
    }

    func stop() {
        // CHANGE 3: cancel the Task first so the async for loop receives a cancellation signal
        feedTask?.cancel()
        feedTask = nil
        task.cancel(with: .goingAway, reason: nil)
    }

    private func webSocketMessages() -> AsyncStream<URLSessionWebSocketTask.Message> {
        AsyncStream { [weak self] continuation in
            // CHANGE 2: when the stream is terminated (task cancelled or finish called), also cancel the WebSocket task so receive() stops firing
            continuation.onTermination = { [weak self] _ in
                self?.task.cancel(with: .goingAway, reason: nil)
            }
            func scheduleReceive() {
                // CHANGE 2: check for Task cancellation before scheduling another receive to break the recursive loop
                guard !Task.isCancelled, let self else {
                    continuation.finish()
                    return
                }
                self.task.receive { result in
                    switch result {
                    case .success(let msg):
                        continuation.yield(msg)
                        scheduleReceive()
                    case .failure:
                        continuation.finish()
                    }
                }
            }
            scheduleReceive()
        }
    }
}
```

## Explanation

### Issue 1: Strong `self` capture keeps manager alive

**Problem:** The `Task` closure inside `start()` captures `self` (the `LiveFeedManager`) strongly. As long as the task is running — which is indefinitely, because the loop never exits — the manager cannot be deallocated. The view model calls `stop()` in `deinit`, but `deinit` is never reached because the task holds a strong reference back to the manager.

**Fix:** The `Task` closure is changed to `[weak self]` at `CHANGE 1`. Each use of `self` inside the loop is guarded with `guard let self`, and the loop `break`s if `self` becomes `nil`.

**Explanation:** Swift closures capture variables by strong reference unless you explicitly say otherwise. The `Task` closure is stored on the heap and kept alive by the Swift concurrency runtime until the task finishes. Because the loop inside never finishes (see Issue 2), the closure — and therefore the strong reference to `self` — lives forever. Making the capture `weak` means the manager's reference count is not incremented by the task. Once the view model releases its own reference, the manager can be deallocated. The `guard let self` checks ensure we don't call into a half-torn-down object after deallocation begins. A related pitfall: if `onScore` itself captures the view model strongly and the view model holds the manager, you get a retain cycle even with `[weak self]` here — audit closures stored on the manager as well.

---

### Issue 2: `AsyncStream` never finishes when `URLSessionWebSocketTask` is cancelled

**Problem:** `stop()` calls `task.cancel(with:reason:)`, which causes the next `task.receive` call to complete with a `.failure` result, triggering `continuation.finish()`. However, `scheduleReceive()` is a recursive call: once a `.success` message is yielded, the next `receive` is already in flight before `cancel` is called. Depending on timing the failure may arrive, but there is no guarantee, and if the Task is cancelled via Swift concurrency the stream has no `onTermination` handler to react to that signal — so the `async for` loop can hang indefinitely.

**Fix:** At `CHANGE 2`, an `onTermination` handler is added to the `continuation` that cancels the underlying `URLSessionWebSocketTask` when the stream is torn down for any reason. Additionally, `scheduleReceive()` checks `Task.isCancelled` before each recursive call so it stops scheduling new receives immediately upon cancellation.

**Explanation:** `AsyncStream` supports a `onTermination` callback that fires when the consumer stops iterating (due to task cancellation, `break`, or the stream finishing normally). Without it, cancelling the Swift `Task` signals the `for await` loop to stop, but `scheduleReceive()` has already dispatched another `task.receive` call that will never be consumed. The `onTermination` handler bridges the Swift concurrency cancellation back to the `URLSessionWebSocketTask` cancellation, causing `task.receive` to return `.failure` and unwinding the recursive chain. The `Task.isCancelled` guard is a belt-and-suspenders check that stops the recursion at the entry point rather than waiting for the network callback.

---

### Issue 3: Discarded `Task` handle provides no external cancellation path

**Problem:** `start()` creates a `Task` but does not store it anywhere. The only way to stop the loop is through stream termination (Issue 2). If that mechanism has a bug or race condition, there is no fallback handle to call `.cancel()` on from `stop()`.

**Fix:** At `CHANGE 3`, a `private var feedTask: Task<Void, Never>?` property is added. `start()` assigns to it, and `stop()` calls `feedTask?.cancel()` before cancelling the WebSocket task, then nils the property.

**Explanation:** Storing the `Task` makes cancellation explicit and deterministic. `feedTask.cancel()` sets the task's cancellation flag immediately, which causes the `for await` loop to check `Task.isCancelled` at its next suspension point and exit. This is independent of whether the network layer responds quickly. It also prevents `start()` from being called multiple times without cleaning up the previous task — assigning a new value to `feedTask` in a second `start()` call would abandon the first task, so in a real implementation you might guard against double-starts, but at minimum the stored handle makes that problem visible and fixable.
