## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Nil-Coalescing Applied Too Late
// ------------------------------------------------------------------------

func displayName(firstName: String?, lastName: String?) -> String {
    let first = firstName ?? ""
    // CHANGE 1: Use nil-coalescing instead of String(describing:) so a nil lastName becomes "" and a non-nil one stays unwrapped without "Optional(...)" wrapping.
    let last = lastName ?? ""
    if first.isEmpty && last.isEmpty {
        return "Anonymous"
    } else if first.isEmpty {
        return last
    } else if last.isEmpty {
        return first
    } else {
        return "\(first) \(last)"
    }
}
```

## Explanation

### Issue 1: `String(describing:)` Wraps Optional Value

**Problem:** When `lastName` is non-nil, e.g. `"Smith"`, the line `String(describing: lastName)` produces the string `"Optional(\"Smith\")"` rather than `"Smith"`. Users see this raw Optional representation in their notification banners.

**Fix:** Replace `String(describing: lastName)` with `lastName ?? ""` so the optional is unwrapped directly: a non-nil value passes through as-is and a nil value becomes an empty string.

**Explanation:** `String(describing:)` is designed to produce a human-readable description of *any* value, including optionals. When you pass an `Optional<String>` to it, Swift's `CustomStringConvertible` conformance on `Optional` formats it as `Optional("Smith")` rather than unwrapping the payload. The nil-coalescing operator `??` is the right tool here because it extracts the wrapped value when present and substitutes a default when absent, giving you a plain `String` in both cases. A related pitfall is string interpolation: `"\(lastName)"` has the same problem as `String(describing:)` and also renders `Optional("Smith")` for a non-nil optional.

---

### Issue 2: `String(describing: nil)` Produces Non-Empty String

**Problem:** When `lastName` is `nil`, `String(describing: lastName)` produces the string `"nil"` — a four-character, non-empty string. The `last.isEmpty` check therefore never fires for a nil `lastName`, so the function falls into the wrong branch and returns the literal word `"nil"` as part of the display name instead of the intended fallback.

**Fix:** The same change as Issue 1 — replacing `String(describing: lastName)` with `lastName ?? ""` — also fixes this. A nil `lastName` now produces an empty string, so `last.isEmpty` correctly evaluates to `true` and the fallback logic works as intended.

**Explanation:** `String(describing:)` converts nil to the four-character string `"nil"`, which is not empty. That means both emptiness guards (`first.isEmpty && last.isEmpty` and `last.isEmpty`) treat a missing last name the same as a last name whose value is literally `"nil"` — neither guard triggers. Using `??` ensures nil collapses to `""`, keeping the downstream `isEmpty` checks meaningful. This is why users with no last name and a first name would see e.g. `"Alex nil"` rather than just `"Alex"` through this code path.
