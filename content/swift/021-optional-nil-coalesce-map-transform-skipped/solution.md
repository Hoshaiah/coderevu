## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Optional Map Skips Nil Coalesce Transform
// ------------------------------------------------------------------------

// CHANGE 1: Return type changed from String? to String so the ?? fallback is guaranteed non-nil and callers never receive an Optional that can display as nil.
func parseUsername(raw: [String: String], userID: String) -> String {
    return raw["username"]
        .map { $0.trimmingCharacters(in: .whitespaces) }
        ?? "user_" + userID
}

// Caller:
let profile = parseUsername(raw: [:], userID: "42")
// Expected: "user_42"
// Actual:   "user_42"  (now correct)
```

## Explanation

### Issue 1: Return type allows nil to escape

**Problem:** When the API omits `username`, `raw["username"]` is `nil`, `.map` returns `nil`, and `??` correctly substitutes `"user_" + userID`. But the function return type is `String?`, so Swift wraps the entire expression — including the fallback — in an `Optional`. Callers that pass the result to a UI label or use it in string interpolation can end up displaying `"Optional(\"user_42\")"` or, depending on how the caller unwraps, a nil-looking placeholder.

**Fix:** Change the return type from `String?` to `String` at the function signature. The `??` operator already guarantees a non-nil `String` is produced, so no other line needs to change.

**Explanation:** `Optional.map` on a `nil` value returns `nil` (it skips the closure). Then `??` fires and produces the fallback string — a plain `String`, not an `Optional`. When the return type is `String?`, Swift's type inference allows the compiler to re-wrap that `String` in an `Optional`, which is valid but misleading. The caller now holds a `String?` whose `.none` case is impossible at runtime, yet any code path that does not forcefully unwrap it — like `"Hello, \(profile)"` on a `String?` — will produce `"Hello, Optional(\"user_42\")"` or similar. Changing the return type to `String` makes the compiler enforce that no nil can escape the function, documents the invariant to callers, and removes the need for callers to unwrap at all. A related pitfall: if you later add a second optional operation inside the function and want to return `nil` for genuinely unknown profiles, you would restore `String?` deliberately — but every call site must then handle the optional explicitly rather than silently getting a nil-looking string.

---
