---
slug: force-unwrap-optional-chain
track: swift
orderIndex: 1
title: Force Unwrap Crashes on Empty Response
difficulty: easy
tags:
  - optionals
  - force-unwrap
  - networking
  - crash
language: swift
---

## Context

This function is in `UserProfileService.swift` and fetches a user profile from a REST API. It is called every time the profile screen appears. The production backend reliably returns JSON, so the team has used force-unwraps throughout to keep the code concise during a rapid prototyping phase that was never cleaned up.

Users on flaky mobile connections see the app crash to the home screen when loading their profile. The crash report shows `Fatal error: Unexpectedly found nil while unwrapping an Optional value` at the JSON-decoding line. It happens most often when the device switches between Wi-Fi and cellular mid-request.

The team initially blamed a backend bug, but server logs show those requests either never arrived or received a network-layer error before any response body was sent.

## Buggy code

```swift
struct UserProfile: Decodable {
    let id: Int
    let name: String
    let email: String
}

func fetchUserProfile(userID: Int) async throws -> UserProfile {
    let url = URL(string: "https://api.example.com/users/\(userID)")!
    let (data, response) = try await URLSession.shared.data(from: url)

    let httpResponse = response as! HTTPURLResponse
    guard httpResponse.statusCode == 200 else {
        throw URLError(.badServerResponse)
    }

    // Decode the profile — server always sends valid JSON
    let profile = try? JSONDecoder().decode(UserProfile.self, from: data)
    return profile!
}
```
