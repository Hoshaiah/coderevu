---
slug: decodable-optional-field-wrong-default
track: swift
orderIndex: 15
title: Optional Decode Masks Missing Key
difficulty: medium
tags:
  - optionals
  - json
  - correctness
  - error-handling
language: swift
---

## Context

This code is in `OrderResponse.swift`, which decodes a server response for placed orders. The `discountCode` field is optional in the API contract — some orders have a discount applied, most don't. The struct is decoded from JSON returned by the orders endpoint.

After a backend team deployed a change renaming the JSON key from `discount_code` to `coupon_code`, the iOS app silently decoded all orders as having no discount code. The finance team noticed a discrepancy between applied discounts in the backend database and what the app displayed. No crash, no decoding error was logged.

The backend team verified the API was returning `coupon_code` correctly. The iOS team's `CodingKeys` enum still mapped the old key name. The bug is that the mismatch produced `nil` instead of a decoding failure, masking the API contract breakage.

## Buggy code

```swift
import Foundation

struct OrderResponse: Decodable {
    let orderID: String
    let totalAmount: Double
    let discountCode: String?
    let status: String

    enum CodingKeys: String, CodingKey {
        case orderID = "order_id"
        case totalAmount = "total_amount"
        case discountCode = "discount_code"
        case status
    }
}

final class OrderService {
    func decodeOrder(from data: Data) -> OrderResponse? {
        let decoder = JSONDecoder()
        return try? decoder.decode(OrderResponse.self, from: data)
    }
}
```
