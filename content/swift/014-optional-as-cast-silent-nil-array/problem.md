---
slug: optional-as-cast-silent-nil-array
track: swift
orderIndex: 14
title: Silent Nil From Optional as? Cast
difficulty: easy
tags:
  - optionals
  - type-casting
  - correctness
  - collections
language: swift
---

## Context

This code lives in `PreferencesManager.swift`, which reads user preferences from `UserDefaults`. One preference is a list of blocked keywords stored as a JSON-encoded array of strings. The manager exposes a typed accessor that returns `[String]`, falling back to an empty array when the preference is absent.

The feature that filters content by blocked keywords silently does nothing — content that should be blocked passes through. Debugging shows that `blockedKeywords` always returns an empty array even after the user saves a non-empty list. The save path was audited and confirmed correct — `UserDefaults` does contain the data under the expected key.

The team added a log line and found that `UserDefaults.standard.object(forKey:)` returns a non-nil value (it is a `Data` blob). They haven't looked further into the cast chain.

## Buggy code

```swift
import Foundation

class PreferencesManager {
    private let defaults = UserDefaults.standard
    private let keywordsKey = "blockedKeywords"

    var blockedKeywords: [String] {
        get {
            guard let data = defaults.data(forKey: keywordsKey) else {
                return []
            }
            // Attempt to decode JSON array
            let decoded = try? JSONSerialization.jsonObject(with: data)
            return decoded as? [String] ?? []
        }
    }

    func save(keywords: [String]) {
        if let data = try? JSONEncoder().encode(keywords) {
            defaults.set(data, forKey: keywordsKey)
        }
    }
}
```
