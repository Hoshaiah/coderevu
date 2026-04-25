---
slug: memory-timer-strong-capture-view
track: swift
orderIndex: 36
title: Timer Block Retains ViewController
difficulty: easy
tags:
  - memory
  - arc
  - timer
  - retain-cycle
language: swift
---

## Context

This code is in `DashboardViewController.swift`, a UIKit view controller that shows a live data dashboard. A repeating `Timer` is set up in `viewDidAppear` to poll a data source every second and update labels on screen. The timer is stored as an instance property.

Testers noticed that after navigating away from the dashboard and back several times, memory usage grows by roughly the size of one `DashboardViewController` per round trip. Instruments confirms that `DashboardViewController` instances are never deallocated. The view controller's `deinit` is never called.

The team confirmed that `navigationController?.popViewController` is being called correctly and the view controller is removed from the hierarchy. They also confirmed there are no other retained references in the coordinator or the navigation stack. The timer was added two sprints ago and the leak correlates precisely with its introduction.

## Buggy code

```swift
class DashboardViewController: UIViewController {
    private var refreshTimer: Timer?

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        refreshTimer = Timer.scheduledTimer(
            withTimeInterval: 1.0,
            repeats: true
        ) { timer in
            self.updateDashboard()
        }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        refreshTimer?.invalidate()
        refreshTimer = nil
    }

    private func updateDashboard() {
        // update UI labels
    }
}
```
