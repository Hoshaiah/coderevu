---
slug: async-let-result-ignored-order
track: swift
orderIndex: 49
title: async-let Result Used Before Await
difficulty: medium
tags:
  - concurrency
  - async-await
  - correctness
language: swift
---

## Context

This function is in `DashboardLoader.swift`, which loads the data needed to render a user dashboard. It fires two parallel network requests using `async let` — one for the user's profile and one for their recent activity feed. Both are needed before the view can be shown. The function is called from the view model's `onAppear` handler.

The dashboard occasionally shows stale or default-initialized data — the `profile` and `feed` variables sometimes appear to be empty structs. The issue is subtle and only appears on fast network connections where both requests complete almost instantly, or in unit tests where the stubs return immediately. On slower connections the data appears correctly.

The team added breakpoints and noticed the return value is populated before both requests finish on fast connections. They assumed `async let` would automatically synchronize the results, which it does — but only if the binding is awaited at the right point.

## Buggy code

```swift
import Foundation

struct UserProfile { var name: String = ""; var avatarURL: URL? }
struct ActivityFeed { var items: [String] = [] }
struct Dashboard { var profile: UserProfile; var feed: ActivityFeed }

func loadDashboard(api: APIClient) async throws -> Dashboard {
    async let profile = api.fetchProfile()
    async let feed = api.fetchFeed()

    // Immediately construct Dashboard — the async lets haven't been awaited yet!
    let result = Dashboard(
        profile: try profile,
        feed: try feed
    )

    // Spurious extra awaits after the value is already used
    _ = try await profile
    _ = try await feed

    return result
}
```
