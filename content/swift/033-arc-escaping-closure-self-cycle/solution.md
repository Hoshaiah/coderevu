## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Escaping Closure Captures Self Strongly
// ------------------------------------------------------------------------

class ProfileLoader {
    private var cachedProfile: Profile?
    private let session: URLSession
    // CHANGE 2: Removed the stored `completionHandler` property; holding onto the closure beyond the call lifetime extended the retain cycle and served no functional purpose.

    init(session: URLSession = .shared) {
        self.session = session
    }

    func load(url: URL, completion: @escaping (Profile?) -> Void) {
        // CHANGE 2: No longer assigning `completion` to `self.completionHandler`; the closure is used directly and released when the data task finishes.
        session.dataTask(with: url) { [weak self] data, _, _ in
            // CHANGE 1: Capture `self` weakly so the closure does not keep `ProfileLoader` alive; if the loader is deallocated before the task finishes, the closure simply skips the cache write.
            guard let data = data else {
                completion(nil)
                return
            }
            let profile = try? JSONDecoder().decode(Profile.self, from: data)
            self?.cachedProfile = profile
            completion(profile)
        }.resume()
    }
}
```

## Explanation

### Issue 1: Strong closure capture creates retain cycle

**Problem:** After the user navigates away from the Profile screen, `ProfileViewController` releases its reference to `ProfileLoader`, but `ProfileLoader` is never deallocated. Instruments shows both objects accumulating on the heap indefinitely, causing the app's memory to grow with every navigation.

**Fix:** The `[weak self]` capture list is added to the `dataTask` closure at the `// CHANGE 1` site, replacing the implicit strong capture of `self`.

**Explanation:** `URLSession.dataTask` retains its closure until the task completes or is cancelled. Inside that closure, `self` (the `ProfileLoader`) was captured strongly. At the same time, `ProfileLoader` stored the `completionHandler` closure (which in turn captured the view controller). This creates a cycle: `ProfileLoader` → `completionHandler` closure → `ProfileViewController` → `ProfileLoader`. With `[weak self]`, the closure holds only a weak reference to `ProfileLoader`. When the view controller is dismissed and drops its strong reference, `ProfileLoader`'s retain count can reach zero and it deallocates normally. The only behavioral difference is that `self?.cachedProfile = profile` becomes a no-op if the loader is already gone, which is the correct outcome — there is no object left to receive the result.

---

### Issue 2: Unnecessary storage of completion handler prolongs closure lifetime

**Problem:** The `completionHandler` property holds the caller's closure for the entire lifetime of the `ProfileLoader` instance, not just for the duration of one network call. This means anything the completion closure captures (such as `ProfileViewController` via `self` in a typical call site) is also kept alive for that entire period, and it amplifies the retain cycle described in Issue 1.

**Fix:** The `completionHandler` property is removed entirely at the `// CHANGE 2` site. The `completion` parameter is passed directly to `completion(nil)` and `completion(profile)` inside the data task closure instead of being routed through the stored property.

**Explanation:** Storing a closure in an instance property is a common pattern when a callback needs to be invoked from multiple places or at an unpredictable time. Here, `completionHandler` is set once and called once per `load` invocation — storing it on `self` adds no value. Because the property kept the closure reachable as long as `ProfileLoader` existed, anything the closure captured (the caller's `self`, context variables, etc.) was also kept alive. Removing the property means the closure is only retained by the data task's internal machinery, and is released as soon as the task calls its completion block. This limits the closure's lifetime to the network round-trip and removes one edge of the retain graph.
