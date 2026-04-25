---
slug: class-deinit-weak-timer-invalidation
track: swift
orderIndex: 32
title: Timer Not Invalidated on Deinit
difficulty: easy
tags:
  - memory
  - timer
  - retain-cycle
language: swift
---

## Context

`LiveScoreManager.swift` polls a sports scores endpoint every five seconds and notifies registered listeners. It uses `Timer.scheduledTimer` with a closure. The manager is created when the user opens the Scores tab and is expected to be released when the user navigates away.

Instruments shows `LiveScoreManager` is never released. The polling continues even after the Scores tab is dismissed, visible in the network traffic log as periodic requests hitting the scores endpoint. After opening and closing the tab a dozen times, there are a dozen overlapping polling timers all firing simultaneously.

The developer confirmed that `deinit` is never called. They used `[weak self]` in the timer closure to avoid a retain cycle, which is correct — but the timer itself is still running and retained by the run loop, which means `deinit` is never reached in the first place.

## Buggy code

```swift
final class LiveScoreManager {
    private var timer: Timer?
    private var onUpdate: (([Score]) -> Void)?

    init(onUpdate: @escaping ([Score]) -> Void) {
        self.onUpdate = onUpdate
        startPolling()
    }

    private func startPolling() {
        timer = Timer.scheduledTimer(withTimeInterval: 5.0,
                                     repeats: true) { [weak self] _ in
            self?.fetchScores()
        }
    }

    private func fetchScores() {
        ScoreService.shared.fetch { [weak self] scores in
            DispatchQueue.main.async {
                self?.onUpdate?(scores)
            }
        }
    }

    deinit {
        timer?.invalidate()
    }
}
```
