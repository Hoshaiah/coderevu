## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Decodable Array Fails on Single Bad Element
// ------------------------------------------------------------------------

// CHANGE 1: Make authorId optional so a null or missing value is accepted instead of throwing DecodingError.
struct FeedItem: Decodable {
    let id: String
    let title: String
    let authorId: String? // CHANGE 1: was `let authorId: String` — non-optional caused valueNotFound for null records
}

// CHANGE 2: Introduce a private FailableDecodable wrapper that isolates per-element decoding errors so one bad item does not abort the whole array.
private struct FailableDecodable<T: Decodable>: Decodable {
    let value: T?
    init(from decoder: Decoder) throws {
        // CHANGE 2: Attempt to decode T; if it throws for any reason, store nil instead of propagating the error.
        let container = try decoder.singleValueContainer()
        self.value = try? container.decode(T.self)
    }
}

struct FeedDecoder {
    func decode(from data: Data) throws -> [FeedItem] {
        // CHANGE 2: Decode as an array of FailableDecodable<FeedItem> so each element is attempted independently, then compact-map to drop nils.
        let wrapped = try JSONDecoder().decode([FailableDecodable<FeedItem>].self, from: data)
        return wrapped.compactMap { $0.value }
    }
}
```

## Explanation

### Issue 1: Non-optional authorId rejects null values

**Problem:** When the backend writes a record with `authorId: null`, Swift's `Decodable` synthesis tries to decode `null` into a non-optional `String` and throws `DecodingError.valueNotFound`. Because this happens inside the array decode, the entire call fails and the app receives zero items even though only a few records are malformed.

**Fix:** Change `let authorId: String` to `let authorId: String?` in `FeedItem`. This is the CHANGE 1 site. The synthesized `init(from:)` now stores `nil` when the field is `null` or absent, instead of throwing.

**Explanation:** Swift's `Codable` synthesis maps JSON `null` to Swift `nil` only when the target type is `Optional`. A non-optional property has no `nil` state, so the decoder has no valid value to produce and throws. Making the property optional tells the decoder that the absence of a real value is a legitimate outcome. One related pitfall: if `authorId` were missing entirely from the JSON object (not just null), a non-optional property also throws `keyNotFound`. The optional fix handles both cases.

---

### Issue 2: Whole-array decode propagates the first element error immediately

**Problem:** Even after making `authorId` optional, if a future field has a different malformation (wrong type, extra nesting, etc.), `JSONDecoder().decode([FeedItem].self)` will still throw on the first bad element and return nothing. Customers see a blank feed instead of 200+ good items.

**Fix:** Replace the direct `[FeedItem].self` decode with a decode into `[FailableDecodable<FeedItem>].self` (CHANGE 2). `FailableDecodable` wraps each element's decode in `try?`, storing `nil` on failure. After decoding, `compactMap { $0.value }` strips the nils, returning only successfully decoded items.

**Explanation:** `JSONDecoder` decodes an array by iterating elements and calling each element's `init(from:)` in sequence. If any element's `init(from:)` throws, that error propagates straight out of the array decode — there is no partial-result concept. The `FailableDecodable` wrapper intercepts the throw at the element boundary: its own `init(from:)` catches the error via `try?` and stores `nil`, so the array decode sees a successful (though nil-valued) element and continues. The outer `compactMap` then removes those nils. One pitfall: `try?` silently discards all decoding errors, so consider logging the failure inside `FailableDecodable.init(from:)` before falling back to `nil` if observability matters.
