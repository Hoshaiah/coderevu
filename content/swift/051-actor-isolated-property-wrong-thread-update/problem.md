---
slug: actor-isolated-property-wrong-thread-update
track: swift
orderIndex: 51
title: Actor Property Updated Off-Actor
difficulty: medium
tags:
  - concurrency
  - actors
  - data-race
  - sendable
language: swift
---

## Context

This actor lives in `OrderProcessor.swift` in a food-delivery backend service compiled as a Swift server-side executable using SwiftNIO. The actor accumulates order totals and tracks failed order IDs so a reconciliation job can retry them. Multiple NIO event-loop callbacks post orders to the actor concurrently.

During load testing with 500 concurrent orders, the `failedOrderIDs` array occasionally contains duplicates, and the `totalRevenue` figure is sometimes lower than the sum of individual order amounts. Thread Sanitizer (TSan) reports a data race on `failedOrderIDs` but the team is confused because they believe actors protect all their state.

A senior engineer suspects the issue is somewhere around the `Notification` callback that is registered in `init`, but no one has pinpointed the exact line.

## Buggy code

```swift
actor OrderProcessor {
    private(set) var totalRevenue: Decimal = 0
    private(set) var failedOrderIDs: [String] = []

    init() {
        NotificationCenter.default.addObserver(
            forName: .orderCancelled,
            object: nil,
            queue: nil
        ) { [weak self] notification in
            guard let self,
                  let id = notification.userInfo?["orderID"] as? String else { return }
            // Directly mutate actor state from a non-isolated closure
            self.failedOrderIDs.append(id)
        }
    }

    func process(order: Order) async throws {
        let charged = try await PaymentGateway.shared.charge(order)
        totalRevenue += charged
    }

    func markFailed(orderID: String) {
        failedOrderIDs.append(orderID)
    }
}
```
