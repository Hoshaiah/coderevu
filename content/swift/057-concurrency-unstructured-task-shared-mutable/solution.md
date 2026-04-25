## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Unstructured Task Mutates Shared Array
// ------------------------------------------------------------------------

class ImageLoader {
    // CHANGE 1: results is now a local variable inside loadImages so it is never shared state; the actor-isolated for-await loop collects results safely and returns them, eliminating the data race entirely.
    private var results: [UIImage] = []

    func loadImages(urls: [URL]) async {
        // CHANGE 1: collect into a local array that is only touched inside the structured for-await loop, which runs on a single task at a time, removing concurrent mutation.
        var localResults: [UIImage] = []
        await withTaskGroup(of: UIImage?.self) { group in
            for url in urls {
                group.addTask {
                    // CHANGE 2: replaced try! with try? so a network or decoding error returns nil instead of crashing the process.
                    let result = try? await URLSession.shared.data(from: url)
                    guard let data = result?.0 else { return nil }
                    return UIImage(data: data)
                }
            }
            for await image in group {
                if let image = image {
                    // CHANGE 1: append to localResults, not self.results; the for-await loop is sequential so this is safe without any lock or actor.
                    localResults.append(image)
                }
            }
        }
        // CHANGE 1: assign the completed local array back to the stored property once all tasks have finished, so the single assignment is safe.
        self.results = localResults
    }

    func allResults() -> [UIImage] {
        return results
    }
}
```

## Explanation

### Issue 1: Concurrent Mutation of Shared Array

**Problem:** Every child task spawned by `withTaskGroup` can finish and call `self.results.append(image)` at the same time as another child task. Swift arrays are not thread-safe; a concurrent append can corrupt the array's internal buffer, producing `EXC_BAD_ACCESS` or silently wrong data. TSan flags this because two threads read and write the same memory without synchronization. The bug only shows on multi-core hardware because the simulator usually schedules tasks sequentially.

**Fix:** A new local variable `localResults` is introduced inside `loadImages`. All appends go to `localResults` inside the `for await image in group` loop, and `self.results` is assigned only once after `withTaskGroup` returns. The final assignment at `CHANGE 1` replaces the scattered in-loop appends to `self.results`.

**Explanation:** `withTaskGroup` spawns child tasks that execute concurrently, but the `for await image in group` loop that collects their results runs on a single execution context — it suspends and resumes as each child completes, never running two iterations at the same time. Appending to a local variable inside that loop is therefore safe without any lock or actor. The one-time assignment `self.results = localResults` happens after all children have finished and the group has been torn down, so there is no concurrent reader at that point either. A related pitfall: if `allResults()` can be called while `loadImages` is still running, you still need actor isolation or a lock around the stored property; that concern is separate from the race fixed here.

---

### Issue 2: Force-Try Crashes on Network Error

**Problem:** `try! await URLSession.shared.data(from: url)` crashes the entire process with an unhandled exception if the network request fails for any reason — bad URL, timeout, no connectivity, server error. In a prefetch scenario triggered by fast scrolling, transient failures are common.

**Fix:** `try!` is replaced with `try?` at `CHANGE 2`, and the optional result is unwrapped with `guard let data = result?.0 else { return nil }`. A failed request now returns `nil` from the child task, which the collection loop already handles by checking `if let image`.

**Explanation:** `try!` is a runtime assertion that the expression never throws. `URLSession.data(from:)` throws on any transport-level error, so on a flaky network every failed prefetch terminates the app. Replacing it with `try?` converts a thrown error into a `nil` optional, letting the caller treat a missing image as a non-fatal absence rather than a fatal fault. The `guard let data = result?.0` unwrap is needed because `try?` on a tuple-returning function produces `Optional<(Data, URLResponse)>`, so the data must be extracted before passing it to `UIImage(data:)`.
