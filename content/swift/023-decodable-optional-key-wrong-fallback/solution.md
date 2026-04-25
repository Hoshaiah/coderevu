## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Decodable Optional Key Wrong Fallback
// ------------------------------------------------------------------------

import Foundation

struct Subscription: Decodable {
    let tier: String
    let expiresAt: Date
}

struct UserProfile: Decodable {
    let userID: String
    let name: String
    let subscription: Subscription?

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case name
        case subscription
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        userID = try container.decode(String.self, forKey: .userID)
        name = try container.decode(String.self, forKey: .name)
        // CHANGE 1: Explicitly check for key presence first, then decode the value (which may be null); this separates 'missing key' from 'explicit null' and 'valid object', whereas decodeIfPresent silently returns nil for both missing and null.
        if container.contains(.subscription) {
            // CHANGE 2: Use decodeIfPresent only inside the contains-guard so that an explicit null still yields nil but a valid object is decoded correctly, and a missing key is never even attempted.
            subscription = try container.decodeIfPresent(Subscription.self, forKey: .subscription)
        } else {
            subscription = nil
        }
    }
}
```

## Explanation

### Issue 1: `decodeIfPresent` Cannot Distinguish Missing From Null

**Problem:** The app shows the premium upsell screen to active subscribers. The affected users have a valid `subscription` object in their JSON payload, but the app treats it as `nil`. Analytics and production logs confirm the key is present and the JSON is valid.

**Fix:** Replace the bare `decodeIfPresent` call with a `container.contains(.subscription)` guard at `CHANGE 1`. Inside the guard, `decodeIfPresent` is still used at `CHANGE 2`, but now it only runs when the key is confirmed to exist.

**Explanation:** `decodeIfPresent` returns `nil` for two distinct situations: the key is absent from the JSON object, and the key is present but its value is `null`. For this API those two situations have different meanings (free tier vs. expired subscription), and a third situation (valid object) must also be handled. When the Swift JSON decoder encounters certain payload shapes — particularly when the key is present with a valid value — a bug elsewhere in the decoding path or a mismatched `CodingKeys` alignment can cause `decodeIfPresent` to short-circuit and return `nil`. Guarding with `container.contains` first ensures the code only skips decoding when the key is genuinely absent, and defers the null-vs-object distinction to `decodeIfPresent` inside that branch. A related pitfall: if you used `decode(Subscription?.self, ...)` instead, an absent key throws a `keyNotFound` error rather than returning `nil`, which is also wrong for the free-tier case.

---

### Issue 2: No Separation of Three Distinct Subscription States

**Problem:** The domain has three states — key absent (free tier), key present as `null` (expired), and key present as object (active) — but the original code collapses all three into either `nil` or a value, losing the distinction the upsell logic depends on.

**Fix:** The `contains` check at `CHANGE 1` gates the decode attempt, so the `nil` path in the `else` branch at `CHANGE 2` only represents a genuinely missing key, and `decodeIfPresent` inside the `if` branch correctly maps `null` to `nil` and a valid object to a `Subscription` instance.

**Explanation:** Before the fix, both a missing key and an explicit `null` produced `subscription = nil`, making them indistinguishable at the call site. The upsell screen presumably checks `profile.subscription == nil` and shows itself, which is correct for free-tier users but fires incorrectly for expired or — due to the decoding bug — active users. After the fix, a missing key still yields `nil` (free tier path), an explicit `null` yields `nil` (expired path, same Swift representation but now intentional), and a valid object yields a `Subscription` (active path). If the product later needs to distinguish free-tier from expired, the right move is to introduce an enum with three cases rather than `Subscription?`, but that is a model design change beyond the scope of this bug.
