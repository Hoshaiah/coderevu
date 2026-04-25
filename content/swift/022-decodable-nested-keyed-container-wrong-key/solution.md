## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Nested Decode Uses Wrong CodingKey
// ------------------------------------------------------------------------

struct PaymentResponse: Decodable {
    let chargeAmount: Decimal
    let chargeCurrency: String
    let feeAmount: Decimal?
    let feeCurrency: String?

    enum CodingKeys: String, CodingKey {
        case amount, fee
    }

    enum AmountKeys: String, CodingKey {
        case value, currency
    }

    init(from decoder: Decoder) throws {
        let root = try decoder.container(keyedBy: CodingKeys.self)

        let amountContainer = try root.nestedContainer(
            keyedBy: AmountKeys.self, forKey: .amount
        )
        chargeAmount = try Decimal(string: amountContainer.decode(
            String.self, forKey: .value
        )) ?? 0
        chargeCurrency = try amountContainer.decode(String.self, forKey: .currency)

        if let feeContainer = try? root.nestedContainer(
            keyedBy: AmountKeys.self, forKey: .fee
        ) {
            // CHANGE 1: read from feeContainer instead of amountContainer so fee fields come from the "fee" JSON object, not the "amount" object
            feeAmount = try Decimal(string: feeContainer.decode(
                String.self, forKey: .value
            )) ?? 0
            // CHANGE 1: same fix for currency — use feeContainer here as well
            feeCurrency = try feeContainer.decode(String.self, forKey: .currency)
        } else {
            feeAmount = nil
            feeCurrency = nil
        }
    }
}
```

## Explanation

### Issue 1: Fee reads from wrong nested container

**Problem:** When a response includes a non-zero fee, the receipt screen shows the charge amount in the fee field and the fee amount in the charge field. Both fields decode without throwing, so there is no runtime error to catch — the values are just transposed.

**Fix:** Replace both `amountContainer.decode(...)` calls inside the `feeContainer` branch with `feeContainer.decode(...)`. The fix appears at the two `CHANGE 1` lines: one for `feeAmount` and one for `feeCurrency`.

**Explanation:** Swift's `KeyedDecodingContainer` is a cursor into a specific JSON object. `amountContainer` is a cursor into the `"amount"` JSON object and `feeContainer` is a cursor into the `"fee"` JSON object. Even though both containers use the same `AmountKeys` enum, they hold completely independent data. The original code opens `feeContainer` correctly (the `if let` binding succeeds when `"fee"` is present) but then ignores it entirely, decoding `value` and `currency` from `amountContainer` a second time. When the fee is zero, both amounts happen to be zero so the transposition is invisible — that is why QA only saw it with non-zero fees. Replacing `amountContainer` with `feeContainer` inside that branch makes each decode call read from the JSON object it was opened against.

---

### Issue 2: `try?` on `nestedContainer` suppresses internal decode errors

**Problem:** `try? root.nestedContainer(keyedBy:forKey:)` discards any error thrown during the construction of the container, but in Swift the `nestedContainer` call itself rarely throws — errors from decoding individual keys inside the container are thrown later, by `decode(_:forKey:)`. So if, for example, `feeContainer.decode(String.self, forKey: .value)` throws because the backend sends a malformed value, the `try?` on the outer call does not catch it; that inner `try` will still propagate. The actual risk is narrower than it looks, but the pattern misleads readers into thinking all fee-decoding errors are safely swallowed.

**Fix:** The minimal fix keeps `try?` in place (it correctly handles the case where the `"fee"` key is absent entirely) but ensures the decode calls inside the branch use plain `try` so genuine field-level errors are not accidentally hidden. This is already the case in the reference solution — the CHANGE 1 lines use `try feeContainer.decode(...)` without `?`.

**Explanation:** In Swift Codable, `nestedContainer(keyedBy:forKey:)` throws if the key is missing or the value is not a JSON object. Using `try?` here is a common idiom to treat an absent `"fee"` key as `nil`. However, the decode calls for individual fields inside that container are separate `try` expressions, so they propagate errors independently. If a caller wrapped the entire `init(from:)` in `try?` or `try!`, a field-level error inside the fee branch would still be silently dropped. For safety, the fee fields should either be decoded with explicit error handling or the whole init should be documented as potentially throwing on malformed fee data.
