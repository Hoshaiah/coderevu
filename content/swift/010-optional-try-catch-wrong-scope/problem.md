---
slug: optional-try-catch-wrong-scope
track: swift
orderIndex: 10
title: try? Discards Nested Error Silently
difficulty: easy
tags:
  - optionals
  - error-handling
  - correctness
language: swift
---

## Context

`Storage/SecureStore.swift` is a thin wrapper around `Keychain` access in a banking app. The `loadCredentials` function attempts to read a stored token, decode it from JSON, and return a `Credentials` value. Errors are expected to surface to the coordinator layer so it can redirect the user to the login screen.

After a keychain migration that changed the stored JSON schema, some users were stuck in an infinite loop: they were not redirected to login (suggesting credentials loaded successfully) but the token they received was always malformed (suggesting they had not). Logging showed `loadCredentials` returning non-nil on affected devices.

The developer checked that `Keychain.read(key:)` correctly throws `KeychainError.itemNotFound` after the migration wiped old entries, but somehow that error was never surfacing at the call site.

## Buggy code

```swift
struct Credentials: Decodable {
    let token: String
    let expiresAt: Date
}

func loadCredentials(for key: String) -> Credentials? {
    let data = try? Keychain.read(key: key)
    guard let data = data else { return nil }
    return try? JSONDecoder().decode(Credentials.self, from: data)
}

// Call site:
// if let creds = loadCredentials(for: "authToken") {
//     useCredentials(creds)
// } else {
//     redirectToLogin()
// }
```
