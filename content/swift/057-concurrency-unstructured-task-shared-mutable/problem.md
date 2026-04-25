---
slug: concurrency-unstructured-task-shared-mutable
track: swift
orderIndex: 57
title: Unstructured Task Mutates Shared Array
difficulty: medium
tags:
  - concurrency
  - data-race
  - async-await
  - sendable
language: swift
---

## Context

This code lives in `ImageLoader.swift`, a helper used by a collection view controller to prefetch thumbnails concurrently. Each visible cell triggers a load; results are appended to a shared `results` array which the controller later reads to populate cells. The code uses `Task { }` to parallelize downloads.

Users on devices with more CPU cores report intermittent crashes with `EXC_BAD_ACCESS` or garbled image data in cells. The crashes are rare and non-deterministic, and only appear when scrolling quickly through a large grid. Single-core simulator runs are clean.

Thread Sanitizer (TSan) reliably flags a data race on the `results` array when enabled. The team disabled TSan to ship but the underlying problem remains.

## Buggy code

```swift
class ImageLoader {
    private var results: [UIImage] = []

    func loadImages(urls: [URL]) async {
        await withTaskGroup(of: UIImage?.self) { group in
            for url in urls {
                group.addTask {
                    let (data, _) = try! await URLSession.shared.data(from: url)
                    return UIImage(data: data)
                }
            }
            for await image in group {
                if let image = image {
                    self.results.append(image)  // mutated from multiple tasks
                }
            }
        }
    }

    func allResults() -> [UIImage] {
        return results
    }
}
```
