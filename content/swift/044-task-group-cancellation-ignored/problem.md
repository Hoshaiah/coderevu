---
slug: task-group-cancellation-ignored
track: swift
orderIndex: 44
title: Task Cancellation Error Silently Dropped
difficulty: medium
tags:
  - concurrency
  - task-cancellation
  - error-handling
  - async-await
language: swift
---

## Context

This code is in `ImagePrefetcher.swift`, a utility that downloads a batch of images before the user scrolls to them. It is invoked when a gallery screen appears and cancelled when the user navigates away. The cancellation is triggered by calling `.cancel()` on the `Task` that runs `prefetchAll`.

Memory profiling shows that after navigating away from the gallery, the URLSession tasks continue running and completing in the background. Network traffic is observed long after the gallery is dismissed. On low-memory devices this contributes to jetsam kills.

The developer added `try Task.checkCancellation()` thinking it was enough, but the downloads still run to completion after cancellation.

## Buggy code

```swift
actor ImagePrefetcher {
    private var cache: [URL: Data] = [:]

    func prefetchAll(urls: [URL]) async {
        await withTaskGroup(of: Void.self) { group in
            for url in urls {
                group.addTask {
                    await self.prefetch(url: url)
                }
            }
        }
    }

    private func prefetch(url: URL) async {
        // Check once at the start, then proceed
        _ = try? Task.checkCancellation()

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            cache[url] = data
        } catch {
            // Ignore download errors
        }
    }
}
```
