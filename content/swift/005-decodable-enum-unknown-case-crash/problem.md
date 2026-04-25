---
slug: decodable-enum-unknown-case-crash
track: swift
orderIndex: 5
title: Unhandled Enum Case Crashes Decoder
difficulty: easy
tags:
  - optionals
  - codable
  - api-compatibility
language: swift
---

## Context

This model lives in `OrderStatus.swift` in an iOS e-commerce app. The app receives order status updates from a REST API over a WebSocket connection. The `Order` struct uses `Codable` for decoding JSON payloads. The backend is independently deployed and occasionally ships new order states (like `"on_hold"` or `"partially_shipped"`) before the mobile app is updated in the App Store.

When the backend introduces a new status string that the Swift enum doesn't know about, the entire order list fails to decode and the screen shows an error state instead of showing orders with known statuses. Users file support tickets saying "my orders disappeared" after app-backend version skew. Crash reports show `Swift.DecodingError.dataCorrupted` in the JSON decoding path.

The team verified the JSON payload is well-formed. The backend contract says new statuses may be added at any time without a breaking version bump, following an additive compatibility policy.

## Buggy code

```swift
import Foundation

enum OrderStatus: String, Codable {
    case pending
    case processing
    case shipped
    case delivered
    case cancelled
}

struct Order: Codable {
    let id: UUID
    let customerName: String
    let status: OrderStatus
    let totalAmount: Double
}

// Decoding call site in OrdersViewModel:
// let orders = try JSONDecoder().decode([Order].self, from: data)
```
