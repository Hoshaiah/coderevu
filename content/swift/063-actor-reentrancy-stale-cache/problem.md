---
slug: actor-reentrancy-stale-cache
track: swift
orderIndex: 63
title: Actor Reentrancy Corrupts Cache State
difficulty: hard
tags:
  - concurrency
  - actors
  - reentrancy
  - async-await
language: swift
---

## Context

`Sources/Services/UserCache.swift` implements an actor-isolated in-memory cache for user profiles fetched from the server. The cache is intended to prevent duplicate network requests: if a fetch is already in-flight for a user ID, callers should wait for the same request rather than launching a second one. This is a common coalescing pattern.

In production, the backend team observes duplicate API calls for the same user IDs arriving almost simultaneously. The iOS app is clearly firing multiple requests for the same resource. CPU profiles show that cache insertions are happening, but the guard that's supposed to detect an in-flight request is not preventing the second launch. There are no crashes — just wasteful duplicate traffic and occasional inconsistent UI state when two responses race.

The team confirmed the actor compiles with no warnings and assumed actor isolation would serialise all access automatically. They believe the cache check and the network launch are atomic because they are inside the actor.

## Buggy code

```swift
import Foundation

actor UserCache {
    private var profiles: [String: UserProfile] = [:]
    private var inFlight: [String: Task<UserProfile, Error>] = [:]

    func profile(for userID: String) async throws -> UserProfile {
        if let cached = profiles[userID] {
            return cached
        }

        if let task = inFlight[userID] {
            return try await task.value
        }

        let task = Task {
            try await NetworkClient.shared.fetchUser(id: userID)
        }
        inFlight[userID] = task

        let profile = try await task.value   // suspension point
        profiles[userID] = profile
        inFlight.removeValue(forKey: userID)
        return profile
    }
}
```
