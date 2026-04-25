---
slug: weak-self-missing-timer-cycle
track: swift
orderIndex: 25
title: Retain Cycle Via Timer Closure
difficulty: easy
tags:
  - memory
  - retain-cycle
  - arc
  - closures
language: swift
---

## Context

This code lives in `SessionManager.swift`, a reference-type class owned by the app's root coordinator. It starts a repeating `Timer` when the user logs in and is supposed to deallocate when the session ends. The app uses ARC with no special memory tooling configured in CI.

QA noticed that memory usage climbs slowly over multiple login/logout cycles without ever coming back down. Instruments shows `SessionManager` instances piling up — none are ever released after logout. The coordinator sets its `sessionManager` property to `nil` on logout, which should be enough to drop the last strong reference.

The team added a `deinit` print statement and confirmed it is never called. They verified the coordinator itself is not leaking.

## Buggy code

```swift
import Foundation

final class SessionManager {
    private var timer: Timer?
    private let userID: String
    private var tickCount = 0

    init(userID: String) {
        self.userID = userID
    }

    func startHeartbeat() {
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { _ in
            self.tickCount += 1
            print("Heartbeat \(self.tickCount) for user \(self.userID)")
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    deinit {
        timer?.invalidate()
        print("SessionManager deallocated")
    }
}
```
