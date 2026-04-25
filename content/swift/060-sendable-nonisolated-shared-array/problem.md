---
slug: sendable-nonisolated-shared-array
track: swift
orderIndex: 60
title: Nonisolated Mutation of Shared Array
difficulty: hard
tags:
  - concurrency
  - sendable
  - data-race
  - actors
language: swift
---

## Context

This code is in `EventBus.swift`, a lightweight publish-subscribe system used throughout the app. Subscribers register a handler closure and later unsubscribe by calling `remove`. The bus is used from multiple `Task` contexts across the app, including background fetch tasks and UI event handlers.

The app occasionally crashes with `EXC_BAD_ACCESS` or produces corrupted subscriber lists — handlers fire for the wrong events or not at all. The crashes are non-deterministic and happen more often on devices with more CPU cores. Thread Sanitizer flags a data race on `subscribers` when the test suite runs with concurrency stress testing enabled.

The team added `actor` to the type to fix it, but then moved the `count` computed property outside the actor with `nonisolated` to avoid async call sites — and the data race returned.

## Buggy code

```swift
import Foundation

typealias EventHandler = (String) -> Void

actor EventBus {
    private var subscribers: [UUID: EventHandler] = [:]

    func subscribe(handler: @escaping EventHandler) -> UUID {
        let id = UUID()
        subscribers[id] = handler
        return id
    }

    func remove(id: UUID) {
        subscribers.removeValue(forKey: id)
    }

    func publish(event: String) {
        subscribers.values.forEach { $0(event) }
    }

    // Convenience: synchronously readable count without await
    nonisolated var count: Int {
        subscribers.count
    }
}
```
