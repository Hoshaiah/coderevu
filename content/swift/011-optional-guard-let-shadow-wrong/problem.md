---
slug: optional-guard-let-shadow-wrong
track: swift
orderIndex: 11
title: Shadowed Optional Loses Original Value
difficulty: easy
tags:
  - optionals
  - shadowing
  - guard
  - correctness
language: swift
---

## Context

This code lives in `ProfileViewController.swift`, a UIKit view controller that loads a user profile from a cache and falls back to a network fetch. The `cachedProfile` property is an optional `UserProfile?` stored on the view model. The method `loadProfile()` is called in `viewWillAppear`.

Users report that the profile name always shows as "Unknown" even when a cached profile is clearly available — tapping a debug button that prints the cache confirms the data is present. The bug only affects the display path, not actual data integrity.

The team checked the network layer and confirmed the fallback fetch works correctly. The issue is isolated to the early-return / cached path inside `loadProfile`.

## Buggy code

```swift
struct UserProfile {
    let name: String
    let avatarURL: URL?
}

class ProfileViewModel {
    var cachedProfile: UserProfile?
}

class ProfileViewController: UIViewController {
    let viewModel = ProfileViewModel()
    var nameLabel: UILabel = UILabel()

    func loadProfile() {
        let cachedProfile = viewModel.cachedProfile
        guard let cachedProfile = viewModel.cachedProfile else {
            fetchFromNetwork()
            return
        }
        // Intended to use the unwrapped cached profile
        displayProfile(cachedProfile)
    }

    func displayProfile(_ profile: UserProfile) {
        nameLabel.text = profile.name
    }

    func fetchFromNetwork() {
        // network fetch omitted
        nameLabel.text = "Unknown"
    }
}
```
