---
slug: sendable-captured-mutable-struct-race
track: swift
orderIndex: 67
title: Mutable Struct Captured Across Actor Boundary
difficulty: hard
tags:
  - concurrency
  - sendable
  - actors
  - data-race
language: swift
---

## Context

`Sync/SyncCoordinator.swift` orchestrates background syncing of user preferences. It builds a `SyncPayload` struct, hands it to an actor-based uploader, and then mutates the same struct to add audit metadata before logging it. The code passes Swift's strict concurrency checks with `-strict-concurrency=targeted` (not `complete`).

Under load testing with Swift's Thread Sanitizer enabled and `-strict-concurrency=complete`, the sanitizer reports a data race on `SyncPayload.timestamp` and `SyncPayload.entries`. The race only shows up when the uploader actor is congested and the mutation happens before the actor has finished processing its copy — which is every time under load.

The developer believed that because `SyncPayload` is a struct (value type), passing it to the actor would automatically copy it, preventing the race. The struct does not conform to `Sendable` explicitly.

## Buggy code

```swift
struct SyncPayload {
    var entries: [String: String]
    var timestamp: Date
    var auditTag: String?
}

actor SyncUploader {
    func upload(_ payload: SyncPayload) async {
        // Simulated async upload work
        try? await Task.sleep(nanoseconds: 100_000_000)
        print("Uploaded \(payload.entries.count) entries at \(payload.timestamp)")
    }
}

class SyncCoordinator {
    private let uploader = SyncUploader()

    func sync(entries: [String: String]) {
        var payload = SyncPayload(entries: entries, timestamp: Date(), auditTag: nil)
        Task {
            await uploader.upload(payload)
        }
        // Mutate after handing off — believed safe because struct is a value type
        payload.auditTag = "coordinator-v2"
        logPayload(payload)
    }

    private func logPayload(_ payload: SyncPayload) {
        print("Logged: \(payload.auditTag ?? "none")")
    }
}
```
