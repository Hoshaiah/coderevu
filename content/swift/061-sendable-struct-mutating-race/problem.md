---
slug: sendable-struct-mutating-race
track: swift
orderIndex: 61
title: Mutating Struct Shared Across Tasks
difficulty: hard
tags:
  - concurrency
  - sendable
  - data-race
language: swift
---

## Context

This code is in `MetricsCollector.swift`, a telemetry subsystem in a server-side Swift application built with Swift on Server. `RequestMetrics` is a value type that accumulates timing and error information during request processing. Multiple async tasks are spawned per request to handle parallel pipeline stages, and each updates the shared metrics struct.

In production the metrics reported to the analytics backend are frequently inconsistent — error counts don't match what's logged, timing totals are occasionally zero despite successful requests, and some fields show values from a previous request. The bug is non-deterministic and only appears under load (>50 concurrent requests). The team enabled the Thread Sanitizer locally and saw data race warnings, but couldn't reproduce the corruption reliably.

Because `RequestMetrics` is a struct (value type), the team assumed it was safe to share. They reasoned that Swift value semantics would make each task work on a copy. The flaw in that reasoning is what needs to be identified.

## Buggy code

```swift
import Foundation

struct RequestMetrics {
    var requestID: UUID
    var durationMs: Double = 0
    var errorCount: Int = 0
    var statusCode: Int = 200
}

class RequestPipeline {
    var metrics = RequestMetrics(requestID: UUID())

    func run() async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask {
                // Simulate stage 1
                self.metrics.durationMs += 12.5
            }
            group.addTask {
                // Simulate stage 2
                self.metrics.statusCode = 201
            }
            group.addTask {
                // Simulate stage 3: error path
                self.metrics.errorCount += 1
            }
        }
    }

    func report() {
        print("Request \(metrics.requestID): \(metrics.durationMs)ms, status \(metrics.statusCode), errors \(metrics.errorCount)")
    }
}
```
