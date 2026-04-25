---
slug: optional-try-map-wrong-error-handling
track: swift
orderIndex: 17
title: try? Hides Decode Error Silently
difficulty: medium
tags:
  - optionals
  - error-handling
  - decodable
  - correctness
language: swift
---

## Context

This function lives in `CacheStore.swift` in a caching layer that persists `UserProfile` objects to disk using `JSONEncoder`/`JSONDecoder`. When the app launches, it attempts to load a cached profile to skip the network round-trip on the first screen. The function is called during app startup and the result is passed directly to the initial view.

After shipping a model update that added a new non-optional field `accountTier` to `UserProfile`, crash rates dropped to zero (because `try?` masks the decode error), but the first screen now always performs a fresh network fetch even for users who were active yesterday. Users on slow connections complain about a blank screen on every cold launch.

The team ruled out a cache-invalidation bug — the file is definitely present on disk with the correct path. The issue is in deserialization.

## Buggy code

```swift
struct UserProfile: Codable {
    let id: UUID
    let displayName: String
    let accountTier: String  // added in v2.0; old cached files lack this key
}

func loadCachedProfile(at url: URL) -> UserProfile? {
    guard let data = try? Data(contentsOf: url) else {
        return nil
    }
    // try? silently returns nil when the model has changed and decoding fails
    return try? JSONDecoder().decode(UserProfile.self, from: data)
}

func loadProfile() async -> UserProfile {
    let cacheURL = FileManager.default
        .urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("userprofile.json")

    if let cached = loadCachedProfile(at: cacheURL) {
        return cached
    }
    return await ProfileService.shared.fetchFromNetwork()
}
```
