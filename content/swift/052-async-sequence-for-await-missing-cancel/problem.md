---
slug: async-sequence-for-await-missing-cancel
track: swift
orderIndex: 52
title: AsyncSequence Loop Never Terminates
difficulty: medium
tags:
  - concurrency
  - async-await
  - resource-management
  - cancellation
language: swift
---

## Context

This class lives in `LiveFeedManager.swift` in a sports-score app. It connects to a WebSocket feed using `URLSessionWebSocketTask` and exposes live score updates. The manager is created when the user navigates to a match detail screen and is expected to stop consuming the feed when the user leaves.

The QA team noticed that after navigating away from match detail and back several times, memory usage climbs steadily and the device runs warm. Instruments shows a growing number of `LiveFeedManager` instances that are never released, and the network activity indicator stays on permanently.

The view model calls `manager.stop()` in `deinit`, but because the manager is never released, `deinit` is never called — a classic reference cycle. The root cause, however, is not an explicit retain cycle but an `async for` loop that keeps the manager alive.

## Buggy code

```swift
class LiveFeedManager {
    private let task: URLSessionWebSocketTask
    var onScore: ((ScoreUpdate) -> Void)?

    init(url: URL) {
        task = URLSession.shared.webSocketTask(with: url)
    }

    func start() {
        task.resume()
        Task {
            for await message in webSocketMessages() {
                if let update = ScoreUpdate(message) {
                    onScore?(update)
                }
            }
        }
    }

    func stop() {
        task.cancel(with: .goingAway, reason: nil)
    }

    private func webSocketMessages() -> AsyncStream<URLSessionWebSocketTask.Message> {
        AsyncStream { continuation in
            func scheduleReceive() {
                task.receive { result in
                    switch result {
                    case .success(let msg):
                        continuation.yield(msg)
                        scheduleReceive()
                    case .failure:
                        continuation.finish()
                    }
                }
            }
            scheduleReceive()
        }
    }
}
```
