---
slug: actor-reentrancy-balance-update-lost
track: swift
orderIndex: 69
title: Actor Reentrancy Loses Balance Update
difficulty: hard
tags:
  - concurrency
  - actor
  - reentrancy
  - correctness
language: swift
---

## Context

This code lives in `WalletActor.swift`, a Swift actor that manages a user's in-app currency balance in a mobile game. `deductCost` is called concurrently from multiple game systems (power-ups, upgrades, purchases) each time the player spends currency. The actor is supposed to guarantee that the balance never goes negative.

During load testing, QA finds that the balance occasionally goes negative, and sometimes a cost is deducted twice while an earlier deduction is still in flight. The discrepancy is always a multiple of one of the cost values, suggesting two tasks see the same pre-deduction balance and both proceed.

The team believes actors eliminate all concurrency bugs automatically and is confused by the report. They have confirmed there are no non-isolated stored property accesses, no `nonisolated` annotations on the balance, and no external mutations from outside the actor.

## Buggy code

```swift
actor WalletActor {
    private var balance: Int

    init(initialBalance: Int) {
        self.balance = initialBalance
    }

    func deductCost(_ cost: Int) async throws {
        guard balance >= cost else {
            throw WalletError.insufficientFunds
        }
        // Simulate async work: verify purchase with server
        try await verifyWithServer(cost: cost)
        balance -= cost
    }

    private func verifyWithServer(cost: Int) async throws {
        // Network call — suspends the actor
        try await Task.sleep(nanoseconds: 100_000_000)
    }
}

enum WalletError: Error {
    case insufficientFunds
}
```
