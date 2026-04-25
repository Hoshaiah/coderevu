---
slug: decodable-nested-keyed-container-wrong-key
track: swift
orderIndex: 22
title: Nested Decode Uses Wrong CodingKey
difficulty: hard
tags:
  - optionals
  - decodable
  - correctness
  - json
language: swift
---

## Context

This `Decodable` implementation lives in `PaymentResponse.swift` in a fintech app's payment processing module. The API wraps all monetary values in a nested `"amount"` object containing `"value"` (a `Decimal` string) and `"currency"` (a 3-letter ISO code). A custom `init(from:)` was written because the team wanted to decode the nested amount inline without creating an extra intermediate type.

After a backend update that added an optional `"fee"` nested amount to the response, QA noticed that orders with a non-zero fee always show the fee amount in the main charge field on the receipt screen, and the fee line shows the charge amount instead. Orders with zero fee display correctly.

The backend team confirmed the JSON is well-formed. Decoding does not throw — both values decode without error. The bug is a silent data swap.

## Buggy code

```swift
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
            // BUG: reading from amountContainer instead of feeContainer
            feeAmount = try Decimal(string: amountContainer.decode(
                String.self, forKey: .value
            )) ?? 0
            feeCurrency = try amountContainer.decode(String.self, forKey: .currency)
        } else {
            feeAmount = nil
            feeCurrency = nil
        }
    }
}
```
