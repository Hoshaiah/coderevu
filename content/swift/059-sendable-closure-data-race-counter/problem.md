---
slug: sendable-closure-data-race-counter
track: swift
orderIndex: 59
title: Unsynchronised Counter in Concurrent Tasks
difficulty: hard
tags:
  - concurrency
  - data-race
  - sendable
  - actors
language: swift
---

## Context

This code is in `AnalyticsAggregator.swift`, a utility that processes an array of raw events in parallel to compute aggregate metrics. It is called from a background task after each sync with the analytics backend. The results are stored and displayed on a dashboard.

The reported event counts are occasionally wrong — typically lower than the true value. The discrepancy is non-deterministic and varies by run. On an 8-core device the error is more frequent than on a 2-core device. Thread Sanitizer reliably flags a data race on `successCount` when the test suite is run with sanitisers enabled.

The developer tried adding `@MainActor` to `processAll` but that serialised the parallel work and made it too slow. They then removed it, leaving the current unsynchronised version.

## Buggy code

```swift
struct RawEvent {
    let id: String
    let payload: [String: String]
}

struct AggregateResult {
    var successCount: Int
    var failureCount: Int
}

class AnalyticsAggregator {
    func processAll(events: [RawEvent]) async -> AggregateResult {
        var successCount = 0
        var failureCount = 0

        await withTaskGroup(of: Bool.self) { group in
            for event in events {
                group.addTask {
                    return self.process(event: event)
                }
            }
            for await success in group {
                if success {
                    successCount += 1
                } else {
                    failureCount += 1
                }
            }
        }

        return AggregateResult(successCount: successCount, failureCount: failureCount)
    }

    private func process(event: RawEvent) -> Bool {
        // Simulate processing
        return event.payload["status"] == "ok"
    }
}
```
