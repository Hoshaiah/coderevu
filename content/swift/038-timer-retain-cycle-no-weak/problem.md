---
slug: timer-retain-cycle-no-weak
track: swift
orderIndex: 38
title: Timer Target Retain Cycle
difficulty: medium
tags:
  - memory
  - retain-cycles
  - arc
language: swift
---

## Context

This class lives in `LiveScoreboard.swift`, a UIKit component embedded in a sports app that polls for updated scores every 5 seconds. It uses `Timer.scheduledTimer(timeInterval:target:selector:repeats:)` with `self` as the target. The component is pushed onto a `UINavigationController` stack and popped when the user navigates back.

Memory Instruments shows that `LiveScoreboard` instances accumulate in the heap over multiple navigation sessions — each time the user enters and exits the scoreboard, a new instance is added but the old one is never released. After 10+ navigations the app's memory footprint grows noticeably. The timer also keeps firing in the background, causing spurious network requests long after the screen is gone.

The developer tried adding `timer.invalidate()` in `viewWillDisappear` but that didn't help because sometimes disappear fires and sometimes it doesn't depending on the navigation gesture used.

## Buggy code

```swift
import UIKit

class LiveScoreboard: UIViewController {
    private var timer: Timer?
    private var scores: [String] = []

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        timer = Timer.scheduledTimer(
            timeInterval: 5.0,
            target: self,
            selector: #selector(fetchScores),
            userInfo: nil,
            repeats: true
        )
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        timer?.invalidate()
        timer = nil
    }

    @objc private func fetchScores() {
        // network call to update scores
        scores.append("Goal!")
        tableView.reloadData()
    }

    private var tableView: UITableView = UITableView()
}
```
