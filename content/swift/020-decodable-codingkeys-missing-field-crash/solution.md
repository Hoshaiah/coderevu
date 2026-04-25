## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Missing CodingKey Causes Silent Data Loss
// ------------------------------------------------------------------------

import Foundation

struct Order: Decodable {
    let orderID: String
    let total: Double
    let promoCode: String?

    enum CodingKeys: String, CodingKey {
        case orderID   = "order_id"
        // CHANGE 2: Removed redundant explicit raw value; Swift uses the case name "total" as the key by default, reducing copy-paste risk.
        case total
        // CHANGE 1: Added promoCode case mapped to "promo_code" so the decoder can find and populate this property from the JSON response.
        case promoCode = "promo_code"
    }
}

let json = """
{
    "order_id": "ORD-001",
    "total": 49.99,
    "promo_code": "SAVE10"
}
""".data(using: .utf8)!

do {
    let order = try JSONDecoder().decode(Order.self, from: json)
    print(order.orderID)   // "ORD-001"
    print(order.total)     // 49.99
    print(order.promoCode as Any) // Optional("SAVE10") — fixed!
} catch {
    print("Decode error:", error)
}
```

## Explanation

### Issue 1: Missing `CodingKeys` Case for `promoCode`

**Problem:** The `promoCode` property is always `nil` after decoding, even when the server returns `"promo_code": "SAVE10"` in the JSON body. No error is thrown, so the bug is completely silent.

**Fix:** Add `case promoCode = "promo_code"` to the `CodingKeys` enum, directly mapping the Swift property name to the snake_case JSON key the server sends.

**Explanation:** When a `Decodable` type defines a `CodingKeys` enum, Swift's synthesized `init(from:)` implementation uses *only* the cases listed in that enum to pull values out of the JSON container. Any JSON key without a matching `CodingKeys` case is silently skipped. Because `promoCode` had no case, the decoder never looked for `"promo_code"` in the payload, and the property was left at its default value of `nil`. Adding the case tells the decoder exactly which JSON key to read for that property. A related pitfall: if you later add another property and forget to add its `CodingKeys` case, you get the same silent `nil` with no compile-time or runtime warning.

---

### Issue 2: Redundant Explicit Raw Value on `total`

**Problem:** The case `case total = "total"` assigns an explicit raw value that is identical to the case name itself. This does not cause a bug today, but it adds visual clutter and creates a place where a future rename of the property could diverge from the raw value without the compiler complaining.

**Fix:** Replace `case total = "total"` with just `case total`, relying on Swift's default behavior of using the case name as the raw `String` value.

**Explanation:** In a `CodingKey` enum backed by `String`, any case without an explicit raw value automatically uses the case name as its string key. Writing `= "total"` explicitly does not change the behavior, but it creates a maintenance trap: if a developer renames the property to `orderTotal` and updates the case name but forgets to update the raw value string, the mapping silently breaks. Omitting the redundant assignment lets the compiler enforce consistency between the case name and the JSON key automatically, as long as they match. Reserve explicit raw values only for cases where the JSON key genuinely differs from the Swift property name, as with `orderID = "order_id"` and `promoCode = "promo_code"`.
