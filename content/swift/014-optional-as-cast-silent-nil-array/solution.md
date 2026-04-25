## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Silent Nil From Optional as? Cast
// ------------------------------------------------------------------------

import Foundation

class PreferencesManager {
    private let defaults = UserDefaults.standard
    private let keywordsKey = "blockedKeywords"

    var blockedKeywords: [String] {
        get {
            guard let data = defaults.data(forKey: keywordsKey) else {
                return []
            }
            // CHANGE 1: Use JSONDecoder to mirror JSONEncoder used in save(); this guarantees the type roundtrip produces a proper Swift [String] instead of relying on NSArray-to-[String] bridging via JSONSerialization.
            return (try? JSONDecoder().decode([String].self, from: data)) ?? []
        }
    }

    func save(keywords: [String]) {
        if let data = try? JSONEncoder().encode(keywords) {
            defaults.set(data, forKey: keywordsKey)
        }
    }
}
```

## Explanation

### Issue 1: Encoder/Decoder API mismatch

**Problem:** `save(keywords:)` serializes the `[String]` array with `JSONEncoder().encode(_:)`, but the getter deserializes with `JSONSerialization.jsonObject(with:)`. These two APIs are not symmetric: `JSONEncoder` produces a UTF-8 JSON byte sequence typed by Swift's `Codable` system, while `JSONSerialization` produces Foundation objects (`NSArray`, `NSString`, etc.). The user sees that blocked keywords are always empty even though `UserDefaults` has valid data.

**Fix:** Replace `JSONSerialization.jsonObject(with:)` and the `as? [String]` cast with a single call to `JSONDecoder().decode([String].self, from: data)`, matching the `JSONEncoder` used in `save(keywords:)`.

**Explanation:** `JSONEncoder` and `JSONDecoder` are a matched pair in Swift's `Codable` system. When you encode a `[String]` with `JSONEncoder`, you get a JSON byte blob that `JSONDecoder` can read back directly into a `[String]` with full type safety. `JSONSerialization` sits at a lower level; it knows nothing about Swift's type system and returns Objective-C collection types. Even though a JSON array of strings logically looks the same, the object graph you get back is `NSArray<NSString>`, not `Array<String>`. The `as? [String]` conditional cast from `NSArray` to `[String]` is bridged automatically in many situations, but it is not guaranteed across all Swift runtime versions and configurations, and when it fails it returns `nil` silently. Switching to `JSONDecoder.decode([String].self, from:)` eliminates the bridging step entirely: the result is always a native Swift `[String]` or a thrown error you can inspect.

---

### Issue 2: Silent nil from failed as? cast hides decoding failure

**Problem:** The expression `decoded as? [String] ?? []` returns `[]` whenever the cast fails, with no log, no thrown error, and no indication that anything went wrong. This is exactly the symptom reported: `blockedKeywords` returns an empty array even when valid data exists in `UserDefaults`.

**Fix:** The `// CHANGE 1` replacement with `JSONDecoder().decode([String].self, from: data)` wrapped in `try?` removes the silent `as?` cast entirely; a decode failure still falls back to `[]` via `??`, but it now requires an actual `Codable` error rather than a silent bridging miss.

**Explanation:** `as?` in Swift is designed to return `nil` gracefully when a type conversion is not possible — that is the right behavior for optional casts in general, but it is the wrong tool here because you have no way to distinguish "the data was absent" from "the data was present but the cast failed". The `?? []` default then masks both cases identically. Using `try? JSONDecoder().decode(...)` is only slightly better in that it still swallows the error, but the decoding contract is stricter: `JSONDecoder` will only succeed when the JSON structure exactly matches `[String]`, so failure is far less likely to be a silent type-bridging quirk. For production code, replacing `try?` with a full `do/catch` and a log statement would make failures observable.
