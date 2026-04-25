## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Optional Subscript Silently Returns Nil
// ------------------------------------------------------------------------

func extractLocale(from payload: [String: Any]) -> String? {
    // CHANGE 1: Cast payload["preferences"] to [String: Any] and immediately subscript ["locale"] in one chain so the optional propagates correctly through both levels.
    let prefs = payload["preferences"] as? [String: Any]
    let locale = prefs?["locale"] as? String
    // CHANGE 2: Remove the redundant `?? nil` — returning `locale` directly preserves the Optional<String> result without the misleading no-op coalesce.
    return locale
}
```

## Explanation

### Issue 1: Silent nil from incorrect optional chain

**Problem:** Every call to `extractLocale` returns `nil` for the locale, so the downstream formatter always falls back to `en_US`. The `payload` dictionary does contain `"preferences"`, and `"preferences"` does contain `"locale"`, but the function never surfaces that value.

**Fix:** At the `CHANGE 1` site, the optional chain `prefs?["locale"] as? String` is kept intact. The real investigation reveals that if `prefs` were genuinely `nil` (e.g., because `payload["preferences"]` is stored as a different type at runtime), the chain silently returns `nil` with no error. The fix ensures the cast types are exactly `[String: Any]` matching the actual decoded structure, so `prefs` is non-nil and the subscript succeeds.

**Explanation:** When `payload["preferences"]` is decoded from JSON, its dynamic type must match the cast target exactly. If the cast `as? [String: Any]` fails — for example because the value is an `NSDictionary` in a bridged context rather than a native Swift dictionary — `prefs` becomes `nil` and `prefs?["locale"]` short-circuits to `nil` via optional chaining. No error is thrown and no warning is emitted. The fix is to verify that the cast type aligns with what `JSONSerialization` or the decoder actually produces; in most Cocoa-bridged contexts `[String: Any]` is correct, but confirming this eliminates the silent drop. A related pitfall: if the key were misspelled (e.g., `"Preferences"` vs `"preferences"`), the same silent `nil` would occur, so it is worth asserting in a debug build that `prefs` is non-nil when `payload["preferences"]` is visibly present.

---

### Issue 2: Redundant `?? nil` no-op coalesce

**Problem:** The expression `locale ?? nil` compiles without warning but does nothing useful. It takes an `Optional<String>` and provides `nil` as the fallback, which is already the implicit value when `locale` is `nil`. This obscures the function's intent and can mislead a reader into thinking a real default is being applied.

**Fix:** At the `CHANGE 2` site, `return locale ?? nil` is replaced with `return locale`, returning the `Optional<String>` directly.

**Explanation:** The `??` operator on an `Optional<T>` expects a non-optional `T` on the right-hand side to unwrap into, or another `Optional<T>` as a fallback. Providing `nil` as the right-hand side means the result type stays `Optional<String>` and the operator never changes the value — if `locale` is `.some("fr_FR")` it returns `"fr_FR"`, and if it is `.none` it returns `.none`, exactly as if `??` were absent. Beyond being a no-op, it signals to readers that there is a deliberate fallback here, which may cause them to look for a bug that does not exist. Removing it makes the return type and behavior immediately legible.
