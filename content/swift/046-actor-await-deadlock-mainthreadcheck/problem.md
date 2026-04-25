---
slug: actor-await-deadlock-mainthreadcheck
track: swift
orderIndex: 46
title: Actor Hop Blocks Main Thread
difficulty: medium
tags:
  - concurrency
  - actors
  - async-await
  - main-thread
language: swift
---

## Context

This code is in `ProfileViewController.swift`, a standard `UIViewController` subclass in an app that adopted Swift concurrency incrementally. The view controller loads a user profile from a local actor-isolated cache, then updates the UI. The project has strict concurrency checking enabled.

Users on slower devices report that the app freezes for 1-2 seconds when navigating to the profile screen. The freeze is intermittent but reproducible under moderate load. Thread sanitizer shows no data races. Profiling shows the main thread blocked waiting for something, but the team assumes the actor hop is cheap.

The issue is not the network call itself — the data is already cached. The team ruled out layout complexity by profiling the view hierarchy.

## Buggy code

```swift
import UIKit

actor ProfileCache {
    private var profiles: [String: Profile] = [:]

    func profile(for userID: String) async -> Profile? {
        // Simulate cache lookup with minor I/O
        try? await Task.sleep(nanoseconds: 500_000_000)
        return profiles[userID]
    }

    func store(_ profile: Profile, for userID: String) {
        profiles[userID] = profile
    }
}

struct Profile { var name: String }

class ProfileViewController: UIViewController {
    var userID: String = ""
    let cache = ProfileCache()
    @IBOutlet weak var nameLabel: UILabel!

    override func viewDidLoad() {
        super.viewDidLoad()
        Task {
            let profile = await cache.profile(for: userID)
            nameLabel.text = profile?.name ?? "Unknown"
        }
    }
}
```
