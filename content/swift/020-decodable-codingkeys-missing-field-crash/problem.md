---
slug: decodable-codingkeys-missing-field-crash
track: swift
orderIndex: 20
title: Missing CodingKey Causes Silent Data Loss
difficulty: medium
tags:
  - optionals
  - decodable
  - correctness
  - json
language: swift
---

## Context

This code is in `OrderParser.swift`, a module that decodes JSON responses from an e-commerce order API. The `Order` struct conforms to `Decodable` and includes a custom `CodingKeys` enum so that the Swift property name `orderID` maps to the JSON key `"order_id"`. A new field `promoCode` was added to the struct last sprint.

After the change, the team noticed promo codes are never applied even when the server clearly returns them. Server logs confirm the `promo_code` field is present in the JSON response with valid values. No decoding errors are thrown. The struct decodes successfully and the `promoCode` property is always `nil`.

The team checked the JSON decoder configuration and confirmed `keyDecodingStrategy` is `.useDefaultKeys` (not `.convertFromSnakeCase`). They verified the server response format with curl.

## Buggy code

```swift
import Foundation

struct Order: Decodable {
    let orderID: String
    let total: Double
    let promoCode: String?

    enum CodingKeys: String, CodingKey {
        case orderID   = "order_id"
        case total     = "total"
        // promoCode was added to the struct but not to CodingKeys
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
    print(order.promoCode as Any) // nil — bug!
} catch {
    print("Decode error:", error)
}
```
