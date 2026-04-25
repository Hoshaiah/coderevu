## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Optional Decode Masks Missing Key
// ------------------------------------------------------------------------

import Foundation

struct OrderResponse: Decodable {
    let orderID: String
    let totalAmount: Double
    let discountCode: String?
    let status: String

    enum CodingKeys: String, CodingKey {
        case orderID = "order_id"
        case totalAmount = "total_amount"
        // CHANGE 1: Updated the raw value from "discount_code" to "coupon_code" to match the renamed API key; the old key caused the field to always decode as nil.
        case discountCode = "coupon_code"
        case status
    }
}

final class OrderService {
    // CHANGE 2: Changed return type to Result<OrderResponse, Error> and replaced try? with try so decoding errors are propagated instead of silently swallowed.
    func decodeOrder(from data: Data) -> Result<OrderResponse, Error> {
        let decoder = JSONDecoder()
        do {
            let order = try decoder.decode(OrderResponse.self, from: data)
            return .success(order)
        } catch {
            return .failure(error)
        }
    }
}
```

## Explanation

### Issue 1: Stale CodingKey for `discountCode`

**Problem:** Every order decoded by the app shows no discount code, even when the server returns a valid `coupon_code` value. The finance team sees a mismatch between backend records and what the app displays, but no error is ever logged.

**Fix:** In `CodingKeys`, change the raw string for `discountCode` from `"discount_code"` to `"coupon_code"` to match the key the API now sends.

**Explanation:** `JSONDecoder` looks up each `CodingKey` by its raw string value in the JSON payload. When the backend renamed the key, the Swift struct kept the old raw value `"discount_code"`. Because `discountCode` is declared as `String?`, the decoder doesn't find a matching key and assigns `nil` — no error, no warning. This is the designed behavior for optional properties: a missing key is treated as an absent value. The fix is purely mechanical: the raw string must match the key the server actually sends. A related pitfall is that if `discountCode` were non-optional, this would have thrown a `keyNotFound` decoding error immediately, which would have caught the breakage at the integration test stage.

---

### Issue 2: `try?` Discards All Decoding Errors

**Problem:** `decodeOrder` returns `nil` for any failure — a malformed payload, a missing required field, a type mismatch — and the caller has no way to distinguish "the server returned no order" from "the payload was corrupted" or "a required key was renamed".

**Fix:** Replace `try? decoder.decode(...)` with a `do/catch` block that returns `Result<OrderResponse, Error>`, propagating the thrown `DecodingError` to the caller instead of discarding it.

**Explanation:** `try?` converts any thrown error into `nil`, which means every failure mode looks identical to the caller. When the backend renames a non-optional field in the future, the app will again fail silently. Returning `Result<OrderResponse, Error>` forces the call site to handle both the success and failure branches explicitly. The `DecodingError` values Swift produces (`.keyNotFound`, `.typeMismatch`, etc.) contain precise context about which key or type failed, making issues like this one immediately visible in logs or crash reporters. Propagating errors also makes unit tests straightforward: you can assert that a specific `DecodingError` is thrown when the JSON is malformed, rather than just checking for a `nil` return.
