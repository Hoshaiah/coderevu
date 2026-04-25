---
slug: task-sleep-cancellation-ignored
track: swift
orderIndex: 50
title: Task.sleep Ignores Cancellation Token
difficulty: medium
tags:
  - concurrency
  - cancellation
  - async-await
  - task
language: swift
---

## Context

`Sources/Background/PollingWorker.swift` implements a polling loop that checks for server-side configuration updates every 30 seconds. It is started when the app enters the foreground and is supposed to stop cleanly when the app backgrounds. The `Task` is stored and cancelled in the `sceneDidEnterBackground` lifecycle callback.

QA reports that the background task occasionally keeps the app alive for much longer than expected after backgrounding. The task cancellation appears to have no immediate effect — the next poll still fires ~30 seconds later. In some cases `URLSession` work is being started after the system has suspended the process, causing URLError timeouts logged at the next foreground.

The team verified that `task.cancel()` is indeed called. They added a log statement at the top of the loop and confirmed it logs after the cancellation. The `URLSession` request inside `fetchConfig` does respect cancellation — only the sleep appears immune.

## Buggy code

```swift
import Foundation

class PollingWorker {
    private var task: Task<Void, Never>?

    func start() {
        task = Task {
            while !Task.isCancelled {
                await fetchConfig()
                // Wait 30 seconds before the next poll
                try? await Task.sleep(nanoseconds: 30_000_000_000)
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
    }

    private func fetchConfig() async {
        // URLSession request — respects cancellation
        _ = try? await URLSession.shared.data(from: URL(string: "https://example.com/config")!)
    }
}
```
