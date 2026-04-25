---
slug: optional-try-silently-nil
track: swift
orderIndex: 3
title: try? Silently Discards Errors
difficulty: easy
tags:
  - optionals
  - error-handling
  - json
  - correctness
language: swift
---

## Context

This code is in `ConfigLoader.swift`, a utility that reads a JSON configuration file bundled with the app. It is called at launch in `AppDelegate` to populate a global `AppConfig`. The file is always present in the bundle during development and QA testing.

In production, some users intermittently start the app with a default (empty) config, causing features to be silently disabled. Crash reporting shows no crashes. Logs show the config was "loaded" successfully every time. The team cannot reproduce the issue locally because the bundle always contains a valid file in their builds.

A subset of App Store builds had a corrupted JSON file introduced by a build script bug (now fixed), but the silent failure made it impossible to detect in the field.

## Buggy code

```swift
import Foundation

struct AppConfig: Decodable {
    var featureFlags: [String: Bool]
    var apiBaseURL: String
}

final class ConfigLoader {
    static func load() -> AppConfig {
        let fallback = AppConfig(featureFlags: [:], apiBaseURL: "")

        guard let url = Bundle.main.url(forResource: "config", withExtension: "json") else {
            print("Config file not found, using defaults")
            return fallback
        }

        guard let data = try? Data(contentsOf: url) else {
            print("Failed to read config file, using defaults")
            return fallback
        }

        // Decode the config, fall back to defaults if anything goes wrong
        let config = try? JSONDecoder().decode(AppConfig.self, from: data)
        return config ?? fallback
    }
}
```
