---
slug: arc-timer-block-strong-self
track: swift
orderIndex: 34
title: Timer Block Retains ViewController Permanently
difficulty: easy
tags:
  - memory
  - arc
  - timer
  - retain-cycle
language: swift
---

## Context

This code lives in `DashboardViewController.swift`. The view controller starts a repeating `Timer` in `viewDidAppear` to poll an analytics endpoint every 5 seconds and update a badge count. The timer is stored as an instance property so it can be invalidated later.

QA reports that navigating away from `DashboardViewController` and back several times causes memory to grow unboundedly. Instruments shows `DashboardViewController` instances piling up — none are being released. The `deinit` log line is never printed.

The team confirmed there is no delegate pattern in play and no other obvious strong references. The timer was added in the last release and the leak timing matches exactly.

## Buggy code

```swift
import UIKit

class DashboardViewController: UIViewController {
    var pollingTimer: Timer?
    var badgeCount: Int = 0

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        pollingTimer = Timer.scheduledTimer(
            withTimeInterval: 5.0,
            repeats: true
        ) { timer in
            self.refreshBadgeCount()
        }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        pollingTimer?.invalidate()
        pollingTimer = nil
    }

    func refreshBadgeCount() {
        badgeCount += 1
        title = "Dashboard (\(badgeCount))"
    }

    deinit {
        print("DashboardViewController deallocated")
    }
}
```
