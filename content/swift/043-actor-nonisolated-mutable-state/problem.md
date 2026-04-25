---
slug: actor-nonisolated-mutable-state
track: swift
orderIndex: 43
title: Actor Isolation Bypass Via nonisolated
difficulty: medium
tags:
  - concurrency
  - actors
  - data-race
  - async-await
language: swift
---

## Context

This code is in `SessionStore.swift`, an actor that manages the authenticated user session for a SwiftUI app. Multiple async tasks read and write session data concurrently: a background token-refresh task, a logout handler, and view models that read `currentUser`.

The app intermittently crashes with `EXC_BAD_ACCESS` or returns stale user data in the UI. The crashes are hard to reproduce locally but show up frequently in production crash reports from devices under load. Thread Sanitizer flags a data race on `_currentUser` when running the test suite.

The developer added `nonisolated` to `currentUser` to suppress a compiler warning about async access from a `@MainActor` view model, believing the property was read-only enough to be safe.

## Buggy code

```swift
actor SessionStore {
    private var _currentUser: User?
    private var _authToken: String?

    // Intended to be a fast synchronous read for the UI
    nonisolated var currentUser: User? {
        return _currentUser
    }

    func setUser(_ user: User, token: String) {
        _currentUser = user
        _authToken = token
    }

    func logout() {
        _currentUser = nil
        _authToken = nil
    }

    func refreshToken() async throws -> String {
        guard let token = _authToken else {
            throw SessionError.notAuthenticated
        }
        let newToken = try await TokenService.shared.refresh(token)
        _authToken = newToken
        return newToken
    }
}

enum SessionError: Error {
    case notAuthenticated
}
```
