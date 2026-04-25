## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Actor Reentrancy Duplicate Fetch
// ------------------------------------------------------------------------

actor ImageCache {
    private var cache: [URL: UIImage] = [:]
    // CHANGE 2: Track in-flight fetches as continuations so new callers await the existing request instead of starting a duplicate fetch.
    private var inFlight: [URL: [CheckedContinuation<UIImage, Error>]] = [:]

    func image(for url: URL) async throws -> UIImage {
        if let cached = cache[url] {
            return cached
        }

        // CHANGE 1: Check whether a fetch is already in progress; if so, suspend this caller onto the waiting list rather than launching another URLSession request.
        if inFlight[url] != nil {
            return try await withCheckedThrowingContinuation { continuation in
                inFlight[url]!.append(continuation)
            }
        }

        // CHANGE 2: Register this URL as in-flight with an empty continuation list before hitting the suspension point.
        inFlight[url] = []

        do {
            // Suspension point: actor is released here while awaiting
            let (data, _) = try await URLSession.shared.data(from: url)
            guard let image = UIImage(data: data) else {
                throw ImageError.invalidData
            }

            cache[url] = image
            // CHANGE 1+2: Resume every caller that queued up while this fetch was in flight, then remove the in-flight entry.
            let waiters = inFlight.removeValue(forKey: url) ?? []
            for waiter in waiters {
                waiter.resume(returning: image)
            }
            return image
        } catch {
            // CHANGE 2: On failure, propagate the error to all waiting callers and clear the in-flight entry so future calls can retry.
            let waiters = inFlight.removeValue(forKey: url) ?? []
            for waiter in waiters {
                waiter.resume(throwing: error)
            }
            throw error
        }
    }
}

enum ImageError: Error {
    case invalidData
}
```

## Explanation

### Issue 1: Reentrancy Bypasses Cache-Miss Guard

**Problem:** Ten callers arrive at roughly the same time, all see an empty `cache[url]`, and all proceed past the `if let cached` check. Each one then reaches `URLSession.shared.data(from:)` and fires an independent network request. The CDN receives ten requests for the same resource.

**Fix:** Before suspending on `URLSession`, the code now checks `if inFlight[url] != nil`. A caller that finds an existing in-flight entry suspends itself onto `inFlight[url]`, using `withCheckedThrowingContinuation`, instead of starting a new fetch.

**Explanation:** Swift actors guarantee mutual exclusion only for synchronous code between suspension points. When the first caller hits `await URLSession.shared.data(from:)`, it relinquishes the actor. A second caller is then free to enter `image(for:)`, run the `if let cached` check — which still fails because the first caller has not yet written to `cache` — and proceed to its own `await`. Without tracking in-flight requests, every concurrent caller races through the same gap. The fix closes that gap by treating the period between "first caller suspends" and "first caller writes to cache" as a named critical section represented by the `inFlight` dictionary. Callers that arrive during that window suspend as continuations rather than spawning work.

---

### Issue 2: No In-Flight Deduplication Structure

**Problem:** Even after a single fetch completes and stores the image, any caller that entered the function while the fetch was running never sees the result — it has already begun its own fetch. There is no mechanism to notify waiting callers, so the cache population from one request does not benefit any other concurrent request for the same URL.

**Fix:** A new `private var inFlight: [URL: [CheckedContinuation<UIImage, Error>]]` dictionary is added to the actor. The first caller initializes `inFlight[url] = []` before suspending. On success, `inFlight.removeValue(forKey:)` retrieves all queued continuations and calls `waiter.resume(returning: image)` on each. On failure, `waiter.resume(throwing: error)` propagates the error to every waiter and removes the entry so future callers can retry.

**Explanation:** `CheckedContinuation` lets you manually control when a suspended `async` call resumes. By storing one continuation per waiting caller inside the actor (where access is serialized), you avoid any data races on the list itself. When the winning fetch finishes — whether with an image or an error — it iterates the list and resumes every suspended caller in one synchronous pass before relinquishing the actor again. Removing the `inFlight` entry at that same moment ensures the next call after a failure starts fresh rather than finding a stale empty-array entry that would incorrectly look like an in-flight request.
