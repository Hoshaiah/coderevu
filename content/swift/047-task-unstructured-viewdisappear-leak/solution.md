## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Unstructured Task Outlives View
// ------------------------------------------------------------------------

import SwiftUI

struct ImageItem: Identifiable { let id: String; let url: URL }

class ImageService {
    func fetchImages() async throws -> [ImageItem] {
        try await Task.sleep(nanoseconds: 1_000_000_000)
        return []
    }
}

struct ImageGalleryView: View {
    let service: ImageService
    @State private var images: [ImageItem] = []
    @State private var isLoading = false
    // CHANGE 1: Store a reference to the Task so it can be cancelled on disappear.
    @State private var fetchTask: Task<Void, Never>? = nil

    var body: some View {
        List(images) { item in
            Text(item.id)
        }
        .onAppear {
            // CHANGE 2: Cancel any existing Task before starting a new one, preventing duplicate concurrent requests.
            fetchTask?.cancel()
            isLoading = true
            // CHANGE 2: Assign the new Task to fetchTask so we hold a cancellable handle.
            fetchTask = Task {
                do {
                    let result = try await service.fetchImages()
                    // CHANGE 1: Guard against writing results back if the Task was cancelled while awaiting.
                    guard !Task.isCancelled else { return }
                    images = result
                } catch is CancellationError {
                    // CHANGE 1: Swallow CancellationError quietly; it is expected when the view disappears.
                    return
                } catch {
                    print("Fetch error: \(error)")
                }
                isLoading = false
            }
        }
        .onDisappear {
            // CHANGE 3: Actually cancel the running Task here instead of only toggling the unrelated isLoading flag.
            fetchTask?.cancel()
            fetchTask = nil
            isLoading = false
        }
    }
}
```

## Explanation

### Issue 1: Task runs after view is gone

**Problem:** When the user pops the view, the `Task` launched in `onAppear` keeps running. When it finishes it writes into `@State` that is no longer relevant, causing stale images to flash onto the next screen that pushes `ImageGalleryView` again, because SwiftUI can reuse or recreate state across navigation events on slow networks.

**Fix:** Add a `@State private var fetchTask: Task<Void, Never>?` property to hold the handle, assign the `Task` to it in `onAppear`, call `fetchTask?.cancel()` in `onDisappear`, and add a `guard !Task.isCancelled else { return }` check plus a `catch is CancellationError` branch inside the task body.

**Explanation:** An unstructured `Task { }` created inside a view modifier has no automatic lifetime tie to the view. SwiftUI does not cancel it when the view disappears. Holding the `Task` value in `@State` gives you a handle to call `cancel()` on. `cancel()` sets the cooperative cancellation flag but does not forcibly stop execution — the task must check `Task.isCancelled` or call a cancellation-aware API (like `Task.sleep`) which throws `CancellationError`. Adding both the guard and the `CancellationError` catch ensures the task exits cleanly without writing partial results. A related pitfall: if `service.fetchImages()` internally uses `URLSession.data(for:)`, that call also responds to cooperative cancellation, so the fix propagates down the call chain for free.

---

### Issue 2: Duplicate Tasks on repeated navigation

**Problem:** Every time the user navigates back to the screen, `onAppear` fires and starts a brand-new `Task` without stopping the one from the previous appearance. On slow networks two or more concurrent fetches race, and whichever finishes last wins, potentially showing an older result.

**Fix:** Call `fetchTask?.cancel()` at the top of `onAppear` before creating the new `Task`, and assign the new `Task` to `fetchTask`. This is the same `@State` property introduced in the Issue 1 fix.

**Explanation:** SwiftUI calls `onAppear` each time the view is re-mounted, which happens every time the user navigates back to it. Without cancelling first, a second fetch starts while the first is still in-flight. Both tasks hold a reference to the same `@State` binding and both will write to `images` when they complete. The one that finishes later overwrites the earlier result, and there is no guarantee which finishes first on a real network. Cancelling the previous task before starting the next one makes each navigation event produce exactly one active fetch.

---

### Issue 3: `onDisappear` cancellation is not wired to the Task

**Problem:** The original `onDisappear` sets `isLoading = false`, which makes it look like cancellation is handled, but `isLoading` is just a local `Bool` that the running `Task` never reads. The task continues unaffected, so the bug in Issues 1 and 2 persists even though the code appears to address it.

**Fix:** Replace the body of `onDisappear` with `fetchTask?.cancel()` and `fetchTask = nil`, then keep `isLoading = false` as a UI cleanup step afterward.

**Explanation:** The original developer likely intended `isLoading` to act as a cancellation token — set it to false, and the task would stop. But the task never checks `isLoading`; it only reads the return value of `service.fetchImages()`. The flag and the task are entirely disconnected. Swift Concurrency's cooperative cancellation model requires you to hold the `Task` value and call `.cancel()` on it (or use structured concurrency with a `TaskGroup` or `async let` whose scope ends with the view). Nil-ing out `fetchTask` after cancelling it also prevents a future `onAppear` from mistakenly believing there is a live task to cancel when there isn't.
