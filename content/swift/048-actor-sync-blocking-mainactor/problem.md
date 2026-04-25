---
slug: actor-sync-blocking-mainactor
track: swift
orderIndex: 48
title: Synchronous Actor Access Deadlock
difficulty: medium
tags:
  - concurrency
  - actors
  - async-await
language: swift
---

## Context

This code is in `OrderProcessor.swift`, a background service that processes e-commerce orders. `OrderActor` is a Swift actor that serializes access to a shared order queue. The processor is triggered from a button tap in a SwiftUI view via a `@MainActor` annotated method on the view model. The project targets Swift 5.9 with strict concurrency checking enabled.

The app freezes completely when the "Process Orders" button is tapped. The UI becomes unresponsive and the Watchdog kills the app after a few seconds. Instruments shows the main thread blocked in `OrderProcessorViewModel.processTapped()`. No crash log is produced — just a Watchdog termination with `0x8badf00d`.

The team verified the actor itself is not doing anything slow. Removing the actor and replacing it with a plain class makes the freeze go away, which points to something specific about how the actor is being accessed.

## Buggy code

```swift
import Foundation

actor OrderActor {
    private var queue: [Order] = []

    func enqueue(_ order: Order) {
        queue.append(order)
    }

    func processAll() async -> [Order] {
        let pending = queue
        queue.removeAll()
        return pending
    }
}

struct Order { let id: UUID; let amount: Double }

@MainActor
class OrderProcessorViewModel: ObservableObject {
    @Published var processedCount: Int = 0
    private let actor = OrderActor()

    func processTapped() {
        // Process all pending orders synchronously before updating UI
        let semaphore = DispatchSemaphore(value: 0)
        var results: [Order] = []

        Task {
            results = await actor.processAll()
            semaphore.signal()
        }

        semaphore.wait()   // block main thread until task finishes
        processedCount += results.count
    }
}
```
