## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Actor Isolation Bypass Via nonisolated
// ------------------------------------------------------------------------

actor SessionStore {
    private var _currentUser: User?
    private var _authToken: String?

    // CHANGE 1: Removed `nonisolated` so this computed property is actor-isolated, preventing unsynchronized concurrent reads of _currentUser.
    var currentUser: User? {
        return _currentUser
    }

    func setUser(_ user: User, token: String) {
        _currentUser = user
        _authToken = token
    }

    func logout() {
        _currentUser = nil
        _authToken = nil
    }

    func refreshToken() async throws -> String {
        guard let token = _authToken else {
            throw SessionError.notAuthenticated
        }
        let newToken = try await TokenService.shared.refresh(token)
        _authToken = newToken
        return newToken
    }

    // CHANGE 2: Added an explicit async method so @MainActor view models can call `await store.fetchCurrentUser()` without needing nonisolated workarounds.
    func fetchCurrentUser() async -> User? {
        return _currentUser
    }
}

enum SessionError: Error {
    case notAuthenticated
}
```

## Explanation

### Issue 1: `nonisolated` Bypasses Actor Isolation on Mutable State

**Problem:** The app crashes with `EXC_BAD_ACCESS` and Thread Sanitizer reports a data race on `_currentUser`. One thread reads `_currentUser` through `currentUser` at the same moment another thread writes it via `setUser` or `logout`, because `nonisolated` removes the actor's serialization guarantee for that accessor.

**Fix:** Remove the `nonisolated` keyword from `currentUser`, making it a plain actor-isolated computed property. After CHANGE 1, Swift enforces that every access to `currentUser` runs on the actor's executor, serializing reads with all writes.

**Explanation:** Swift actors serialize access to their stored properties by routing all access through the actor's executor. When you mark a computed property `nonisolated`, the compiler lets any thread call it synchronously without hopping onto that executor first. That means `_currentUser` — a plain heap-allocated reference — can be read mid-write, which is undefined behavior in Swift's memory model. The compiler warning the developer suppressed was the correct signal: accessing actor-isolated state from a `@MainActor` context requires `await` because the call must cross executor boundaries, not because of a style preference. Removing `nonisolated` restores the guarantee and turns the call site into a compile error, forcing callers to use `await`, which is the right fix.

---

### Issue 2: No Async Accessor for `@MainActor` Callers

**Problem:** The original developer added `nonisolated` specifically to let `@MainActor` view models read `currentUser` synchronously. Without that escape hatch, view models get a compile error about crossing actor boundaries. The root need — a way to read the user from outside the actor — is legitimate; the implementation was wrong.

**Fix:** Add `fetchCurrentUser() async -> User?` at CHANGE 2. View models call `await store.fetchCurrentUser()`, which hops to the actor's executor for the read and returns safely to the caller's context.

**Explanation:** Swift's concurrency model requires an explicit `await` whenever one actor calls into another. Rather than suppressing that requirement with `nonisolated`, expose an `async` function that lets Swift handle the executor hop correctly. The actor serializes the read with any concurrent writes, so the value returned is always consistent. A common pitfall here is trying to make the property itself `async` with a custom getter; that compiles but is non-idiomatic and can confuse SwiftUI's `@StateObject` observation patterns. A plain `async` method is the straightforward, reviewable solution.
