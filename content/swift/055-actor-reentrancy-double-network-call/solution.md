## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Actor Reentrancy Triggers Duplicate Fetch
// ------------------------------------------------------------------------

actor ImageCache {
    private var cache: [URL: UIImage] = [:]
    // CHANGE 1: Add an in-flight task dictionary so that a second caller for the same URL awaits the existing fetch instead of starting a new one.
    private var inFlight: [URL: Task<UIImage, Error>] = [:]
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func image(for url: URL) async throws -> UIImage {
        if let cached = cache[url] {
            return cached
        }

        // CHANGE 1: If a fetch for this URL is already running, await its result instead of launching a duplicate network request.
        if let existing = inFlight[url] {
            return try await existing.value
        }

        // CHANGE 1: Create and register the Task *before* any suspension point so every subsequent caller finds it in inFlight.
        let task = Task<UIImage, Error> {
            let (data, _) = try await self.session.data(from: url)
            guard let image = UIImage(data: data) else {
                throw ImageCacheError.invalidData
            }
            return image
        }
        inFlight[url] = task

        // CHANGE 2: Use defer to always clean up the in-flight entry and, on success, populate the cache — even when the task throws.
        defer { inFlight[url] = nil }

        let image = try await task.value
        cache[url] = image
        return image
    }
}

enum ImageCacheError: Error {
    case invalidData
}
```

## Explanation

### Issue 1: Reentrancy Allows Duplicate Concurrent Fetches

**Problem:** When two cells request the same URL at the same time, both call `image(for:)`, both read `cache[url]` as `nil`, and both proceed to call `session.data(from:)`. The backend receives two (or twenty) identical requests from the same device within milliseconds.

**Fix:** Add a `[URL: Task<UIImage, Error>]` dictionary called `inFlight`. Before launching a fetch, check whether a `Task` already exists for that URL and `await` its `.value` instead of starting a new request. Register the new `Task` in `inFlight` synchronously before the first `await` so no concurrent caller can miss it.

**Explanation:** Swift actors prevent data races, but they do not prevent reentrancy. Every `await` is a suspension point where the actor's executor can run other pending callers. Caller A suspends at `session.data(from:)`, the actor becomes available, Caller B runs, sees `cache[url] == nil` (because A hasn't written yet), and starts its own fetch. The fix works because `Task { ... }` is created and stored in `inFlight` without any intermediate `await`, so the registration is atomic from the actor's perspective. Any caller that arrives after that point finds the existing `Task` and awaits the same underlying network operation. Both callers ultimately get the same `UIImage` value and only one HTTP request is made.

---

### Issue 2: Failed Fetches Leave inFlight Entry Dangling

**Problem:** If `session.data(from:)` throws or `UIImage(data:)` returns `nil`, the `inFlight[url]` entry is never removed. The next caller for that URL finds a completed-but-failed `Task` and immediately rethrows the old error without retrying, making the image permanently unavailable for the lifetime of the cache actor.

**Fix:** Add `defer { inFlight[url] = nil }` immediately after storing the task. This runs on every exit path — success or thrown error — ensuring the slot is freed so the next caller can attempt a fresh fetch.

**Explanation:** `try await task.value` propagates the task's thrown error out of `image(for:)`. Without `defer`, the `inFlight[url] = nil` line that would follow is never reached on the error path, leaving a finished-but-failed `Task` registered. Any subsequent caller awaits `.value` on that already-failed `Task` and receives the same error instantly. With `defer`, the entry is cleared regardless of outcome, so a transient network error (e.g., a momentary 503) doesn't permanently poison the cache slot.
