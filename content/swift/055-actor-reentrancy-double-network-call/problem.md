---
slug: actor-reentrancy-double-network-call
track: swift
orderIndex: 55
title: Actor Reentrancy Triggers Duplicate Fetch
difficulty: medium
tags:
  - concurrency
  - actor
  - reentrancy
  - async-await
language: swift
---

## Context

`Cache/ImageCache.swift` implements a simple actor-based image cache for a social feed app. The intent is that if two cells request the same URL simultaneously, only one network fetch should be issued and both callers should get the same result. This pattern is known as request coalescing.

In production, the backend team noticed that some popular images were being fetched 10–20 times per second from the same device, far more than expected. Adding response logging on the client confirmed that `URLSession.data(from:)` was being called multiple times concurrently for identical URLs even though the cache actor was supposed to prevent that.

The developer checked that `cache[url]` is read and written inside the actor, which should be safe. The actor isolation itself is not the issue — it compiles and runs without data races according to the sanitizer.

## Buggy code

```swift
actor ImageCache {
    private var cache: [URL: UIImage] = [:]
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func image(for url: URL) async throws -> UIImage {
        if let cached = cache[url] {
            return cached
        }
        let (data, _) = try await session.data(from: url)
        guard let image = UIImage(data: data) else {
            throw ImageCacheError.invalidData
        }
        cache[url] = image
        return image
    }
}

enum ImageCacheError: Error {
    case invalidData
}
```
