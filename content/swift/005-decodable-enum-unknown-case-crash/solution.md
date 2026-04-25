## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Unhandled Enum Case Crashes Decoder
// ------------------------------------------------------------------------

import Foundation

// CHANGE 1: Add an `unknown` fallback case and a custom init(from:) so unrecognized status strings don't throw — they decode to .unknown(rawValue) instead of crashing the decoder.
enum OrderStatus: Codable, Equatable {
    case pending
    case processing
    case shipped
    case delivered
    case cancelled
    case unknown(String) // CHANGE 1: holds the raw unrecognized value for logging/display

    // CHANGE 1: Custom decoder maps known strings to their cases and catches everything else as .unknown.
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "pending":    self = .pending
        case "processing": self = .processing
        case "shipped":    self = .shipped
        case "delivered":  self = .delivered
        case "cancelled":  self = .cancelled
        default:           self = .unknown(raw) // CHANGE 1: unknown status is preserved, not rejected
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .pending:          try container.encode("pending")
        case .processing:       try container.encode("processing")
        case .shipped:          try container.encode("shipped")
        case .delivered:        try container.encode("delivered")
        case .cancelled:        try container.encode("cancelled")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

struct Order: Codable {
    let id: UUID
    let customerName: String
    // CHANGE 2: status is now decoded via the safe OrderStatus init(from:) above, so a single unknown status no longer aborts the entire array decode.
    let status: OrderStatus
    let totalAmount: Double
}

// Decoding call site in OrdersViewModel:
// let orders = try JSONDecoder().decode([Order].self, from: data)
```

## Explanation

### Issue 1: Missing fallback for unknown enum values

**Problem:** When the backend sends a status string like `"on_hold"` that isn't a case in `OrderStatus`, Swift's synthesized `init(from:)` throws `DecodingError.dataCorrupted`. Because the error propagates up uncaught, the entire `[Order]` array fails to decode and the orders screen goes blank.

**Fix:** Replace the `String, Codable` raw-value enum with a custom `init(from:)` that adds an `unknown(String)` associated-value case. Any unrecognized string lands in `.unknown(raw)` instead of throwing. A matching `encode(to:)` round-trips the raw string faithfully.

**Explanation:** Swift's synthesized `Codable` conformance for a `RawRepresentable` enum calls `RawRepresentable.init(rawValue:)` and, if it returns `nil`, immediately throws `dataCorrupted`. There is no hook to intercept that failure without writing your own `init(from:)`. The custom initializer decodes the container as a plain `String` first — that part can still throw if the JSON value isn't a string at all, which is a legitimate error worth surfacing — then dispatches on the string value, routing unrecognized strings to `.unknown` instead of crashing. A related pitfall: if you later add `on_hold` as a real case, the `default` branch will stop reaching it automatically, so no migration is needed for existing decoded data.

---

### Issue 2: Non-optional status field propagates decode failure to the whole array

**Problem:** Even with a resilient enum, if `status` were still decoded by the old throwing path, one bad order would abort the entire `[Order].self` decode. Users see zero orders instead of all orders except the one with the unknown status.

**Fix:** Issue 1's custom `init(from:)` on `OrderStatus` is the direct fix — `Order.status` stays a non-optional `OrderStatus`, but now it always succeeds for any string value because `.unknown(raw)` absorbs the unknown case. No change to `Order`'s field declaration is needed beyond relying on the new safe enum decoder.

**Explanation:** `JSONDecoder` decodes an array by iterating elements and calling each element's `init(from:)` in sequence. If any element throws, the whole array decode fails and you get `nil` (or a rethrown error). Making `status` optional (`OrderStatus?`) is one escape hatch, but it loses the original string value and forces every call site to unwrap. The associated-value approach keeps `status` non-optional and strongly typed while still surviving additive API changes. The raw string inside `.unknown` is also available for telemetry so the team can see which new statuses are arriving before shipping an app update.
