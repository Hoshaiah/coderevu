---
slug: sendable-actor-dict-value-race
track: swift
orderIndex: 64
title: Non-Sendable Value Escapes Actor Boundary
difficulty: hard
tags:
  - concurrency
  - sendable
  - actors
  - data-race
language: swift
---

## Context

`Sources/Cache/ImageCache.swift` is an actor-based cache for decoded `UIImage` objects. Images are fetched from disk and stored in a dictionary. Multiple async tasks fetch images simultaneously; the actor is meant to serialise cache reads and writes. Swift 6 strict concurrency is not yet enabled, so no compiler errors appear.

QA's memory graph shows occasional torn images — a thumbnail displays half of one image and half of another. This is extremely rare and only observed under heavy scrolling in a collection view where many cells request images in parallel. Enabling the Thread Sanitizer reproduces the problem immediately: a data race is reported on `UIImage`'s internal pixel buffer.

The team assumed that because all dictionary reads and writes go through the actor, the images themselves are safe. They did not realise that `UIImage` is a reference type and that handing the same object to multiple consumers is unsafe if anything mutates the image's state (e.g. applying a `preparingForDisplay()` transform).

## Buggy code

```swift
import UIKit

actor ImageCache {
    private var store: [String: UIImage] = [:]

    func image(for key: String) -> UIImage? {
        return store[key]
    }

    func setImage(_ image: UIImage, for key: String) {
        store[key] = image
    }
}

class ThumbnailLoader {
    private let cache = ImageCache()

    func loadThumbnail(key: String, url: URL) async -> UIImage? {
        if let cached = await cache.image(for: key) {
            // Apply a render-preparation pass on the calling task's thread
            return cached.preparingForDisplay()
        }
        guard let data = try? Data(contentsOf: url),
              let image = UIImage(data: data) else { return nil }
        await cache.setImage(image, for: key)
        return image.preparingForDisplay()
    }
}
```
