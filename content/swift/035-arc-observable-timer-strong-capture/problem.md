---
slug: arc-observable-timer-strong-capture
track: swift
orderIndex: 35
title: Strong Self Capture in Timer
difficulty: easy
tags:
  - memory
  - arc
  - retain-cycle
  - timer
language: swift
---

## Context

This code is in `PollViewController.swift`, a view controller that periodically polls a REST endpoint for live match scores. The controller is pushed onto a navigation stack and should be fully released when the user pops back to the previous screen. The timer is started in `viewWillAppear` and is supposed to stop when the controller disappears.

QA reports that the polling continues even after the user navigates away — network logs show the endpoint is still being hit at the 5-second interval long after the view disappears. Instruments confirms that `PollViewController` instances are never deallocated.

The team already checked that `viewWillDisappear` is called correctly (they added a print statement). The timer invalidation line runs, so the timer fires once and then stops — but the controller itself is never freed because it's still retained.

## Buggy code

```swift
class PollViewController: UIViewController {
    private var timer: Timer?
    private var matchID: String = ""

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        timer = Timer.scheduledTimer(withTimeInterval: 5.0,
                                     repeats: true) { _ in
            self.fetchLatestScore()
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        timer?.invalidate()
        timer = nil
    }

    private func fetchLatestScore() {
        // URLSession call using matchID
    }
}
```
