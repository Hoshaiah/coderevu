---
slug: actor-reentrancy-cache-duplicate-fetch
track: swift
orderIndex: 70
title: Actor Reentrancy Duplicate Fetch
difficulty: hard
tags:
  - concurrency
  - actor
  - reentrancy
  - async-await
language: swift
---

## Context

This code is in `ImageCache.swift`, an actor that serves as a shared, in-memory image cache for a photo browsing app. Multiple views call `image(for:)` concurrently when a gallery loads. The actor is intended to coalesce duplicate network fetches so each URL is only downloaded once.

Under load, the network layer logs show the same image URL being fetched multiple times simultaneously — sometimes 10+ times for a single popular image. The excess bandwidth consumption triggered an alert from the CDN provider. The cache hit rate is effectively 0% during cold loads despite the cache being populated.

The team verified that actor isolation is correct — the compiler raised no warnings. They checked the `URLSession` implementation and confirmed it does not deduplicate requests internally. The issue is entirely within the Swift actor.

## Buggy code

```swift
actor ImageCache {
    private var cache: [URL: UIImage] = [:]

    func image(for url: URL) async throws -> UIImage {
        if let cached = cache[url] {
            return cached
        }

        // Suspension point: actor is released here while awaiting
        let (data, _) = try await URLSession.shared.data(from: url)
        guard let image = UIImage(data: data) else {
            throw ImageError.invalidData
        }

        cache[url] = image
        return image
    }
}

enum ImageError: Error {
    case invalidData
}
```
