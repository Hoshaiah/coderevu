## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — ObservableObject Published from Background Thread
// ------------------------------------------------------------------------

import SwiftUI
import Foundation

@MainActor
class FeedViewModel: ObservableObject {
    @Published var posts: [Post] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    func loadFeed() async {
        isLoading = true
        // CHANGE 2: Clear any stale error from a previous failed fetch so the UI does not show an old error while new data arrives.
        errorMessage = nil
        defer { isLoading = false }
        do {
            let url = URL(string: "https://api.example.com/feed")!
            // CHANGE 1: Perform the network call and decoding in a detached nonisolated context so the subsequent hop back to @MainActor is explicit and guaranteed, preventing background-thread @Published mutations.
            let decoded: [Post] = try await Task.detached(priority: .userInitiated) {
                let (data, _) = try await URLSession.shared.data(from: url)
                return try JSONDecoder().decode([Post].self, from: data)
            }.value
            // Back on @MainActor here because `decoded` is a value type returned to the actor-isolated caller.
            posts = decoded
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
```

## Explanation

### Issue 1: Background-thread @Published mutation after await

**Problem:** Users see Xcode purple warnings saying "Publishing changes from background threads is not allowed", and some see `EXC_BAD_ACCESS` crashes during heavy scrolling. The `posts` and `errorMessage` properties are assigned on whichever thread URLSession's completion delivers to, which is a background thread, not the main thread.

**Fix:** The network call and JSON decoding are moved into a `Task.detached` block. The `.value` await suspends the caller — which is `@MainActor`-isolated — until the result is ready, then resumes on the main actor. The assignment `posts = decoded` therefore always runs on the main thread.

**Explanation:** Swift's `@MainActor` guarantees that code *within* a `@MainActor`-isolated function runs on the main actor — but `await` is a suspension point. When `URLSession.shared.data(from:)` completes, the runtime resumes on the cooperative thread pool, not necessarily the main actor. Because `async` functions can resume on any thread after an `await`, the lines immediately after the `await` for `data(from:)` — including the assignments to `posts` and `errorMessage` — execute off the main thread even inside a `@MainActor` class. By doing the I/O and decoding inside `Task.detached` and only touching the `@Published` properties after `.value` returns to the `@MainActor`-isolated caller, all mutations are guaranteed to happen on the main thread. A related pitfall: using `await MainActor.run { }` inline is an equally valid fix, but `Task.detached` makes the intent (CPU work off the main thread, result delivered back) clearer and avoids accidentally capturing `self` in a context where its isolation could be ambiguous.

---

### Issue 2: Stale error persists across fetch attempts

**Problem:** If a fetch fails and sets `errorMessage`, then the user triggers another fetch that succeeds, the old error string stays visible in the UI because nothing clears it before the new request starts. The user sees a success state (new posts loaded) alongside an error banner from a previous failure.

**Fix:** `errorMessage = nil` is added at the top of `loadFeed()`, after setting `isLoading = true` and before the `defer` block, so the error is cleared at the start of every fetch attempt.

**Explanation:** `errorMessage` is only ever written in the `catch` branch. A successful fetch skips that branch entirely, leaving whatever string was set by the last failure in place. Clearing it at the beginning of each load ensures the property reflects the outcome of the *current* fetch, not a historical one. The assignment happens before `defer` registers its cleanup, so even if an error occurs immediately, the sequence is: clear error → attempt fetch → set new error (if any) → clear `isLoading`. This keeps the error state consistent with the in-flight request.
