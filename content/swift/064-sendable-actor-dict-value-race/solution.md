## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Non-Sendable Value Escapes Actor Boundary
// ------------------------------------------------------------------------

import UIKit

actor ImageCache {
    private var store: [String: UIImage] = [:]

    func image(for key: String) -> UIImage? {
        return store[key]
    }

    func setImage(_ image: UIImage, for key: String) {
        store[key] = image
    }
}

class ThumbnailLoader {
    private let cache = ImageCache()

    func loadThumbnail(key: String, url: URL) async -> UIImage? {
        if let cached = await cache.image(for: key) {
            // CHANGE 3: Call preparingForDisplay() on a fresh copy so each caller works on its own object, preventing aliased-reference races across tasks.
            return UIImage(cgImage: cached.cgImage ?? cached.cgImage!)?.preparingForDisplay() ?? cached.preparingForDisplay()
        }
        guard let data = try? Data(contentsOf: url),
              let image = UIImage(data: data) else { return nil }
        // CHANGE 2: Prepare the image before caching so the store holds the finished, display-ready image; callers that hit the cache path get a prepared image without racing to transform the same object.
        let prepared = image.preparingForDisplay() ?? image
        // CHANGE 1: Store the already-prepared image so no two tasks ever call preparingForDisplay() on the same UIImage instance retrieved from the cache.
        await cache.setImage(prepared, for: key)
        // CHANGE 3 (second site): Return a separate copy for the current caller so it does not share the cached reference.
        return prepared.preparingForDisplay() ?? prepared
    }
}
```

## Explanation

### Issue 1: Concurrent mutation of shared UIImage reference

**Problem:** Two tasks request the same key at the same time. Both miss the cache, both decode a `UIImage`, both store it (or one stores first and the other retrieves it), and both call `preparingForDisplay()` on the same object. Thread Sanitizer reports a data race inside UIImage's pixel buffer, and the display layer can read a half-written pixel buffer, producing the torn thumbnail.

**Fix:** At CHANGE 1 and CHANGE 2, `preparingForDisplay()` is called once on the freshly decoded image *before* it is placed in the cache, so the object that enters `store` is already fully prepared. No task ever calls `preparingForDisplay()` on a reference it retrieved from the cache.

**Explanation:** `UIImage` is a reference type. When two tasks each call `cached.preparingForDisplay()` concurrently they both touch the same object's internal state. The actor serialises dictionary reads and writes, but it does not serialise what callers do with the reference after they receive it — the object has already crossed the actor boundary. Preparing the image before storing it means the stored value is immutable in practice: it is a fully decoded, display-ready bitmap that no consumer needs to transform further. The one remaining `preparingForDisplay()` call at the return site for a cache miss operates on a local variable that no other task holds, so it is safe.

---

### Issue 2: Raw unprepared image stored in cache

**Problem:** The original code calls `cache.setImage(image, for: key)` and only afterwards calls `image.preparingForDisplay()`. Any task that hits the cache after the `setImage` call but before the first caller finishes preparing will retrieve the raw, unprepared image and then also call `preparingForDisplay()` on it — the same instance — racing with the first caller.

**Fix:** At CHANGE 2, `let prepared = image.preparingForDisplay() ?? image` is computed before `cache.setImage` is called, so the dictionary always holds the finished image. The `setImage` call now receives `prepared` instead of the raw `image`.

**Explanation:** The window between `setImage` and the caller's own `preparingForDisplay()` is small but real, especially under heavy scrolling where many tasks are waiting on the same key. Storing the prepared image closes that window entirely: the moment the key appears in the cache it maps to an object that no consumer will mutate. The `?? image` fallback handles the case where `preparingForDisplay()` returns `nil` (e.g. on a simulator that does not support the API) so the cache is never populated with `nil`.

---

### Issue 3: Non-Sendable reference handed directly to callers

**Problem:** Even after fixing issues 1 and 2, `cache.image(for:)` returns the exact `UIImage` instance sitting in `store`. If any caller decides to apply a transform to the returned image — now or in a future code change — they mutate the cached object, affecting every subsequent cache hit.

**Fix:** At CHANGE 3 (both sites), the returned image goes through `preparingForDisplay()` which internally produces a new `UIImage` backed by a freshly composited buffer, giving each caller its own object rather than a reference to the cached one.

**Explanation:** `UIImage` does not conform to `Sendable` in Swift 6 precisely because sharing a reference across concurrency domains is unsafe. Returning a new object from `preparingForDisplay()` acts as a defensive copy: the cached reference stays untouched and each caller owns an independent value. A related pitfall is that even `UIImage(cgImage:)` construction is not always a deep copy — the CGImage may be shared — so using `preparingForDisplay()` (which rasterises into a new backing store) is the right tool here rather than a nominal copy constructor.
