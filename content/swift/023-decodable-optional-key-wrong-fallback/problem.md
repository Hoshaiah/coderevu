---
slug: decodable-optional-key-wrong-fallback
track: swift
orderIndex: 23
title: Decodable Optional Key Wrong Fallback
difficulty: hard
tags:
  - optionals
  - codable
  - error-handling
language: swift
---

## Context

`UserProfile.swift` models the response from a user-profile REST endpoint. The API sometimes omits the `"subscription"` key entirely for free-tier users, and sometimes returns `null` explicitly for users whose subscription has expired. A third state — an object with a `"tier"` field — represents active subscribers. The developer used a nested `Subscription` struct marked as `Optional` to handle the absent case.

Analytics show that the app incorrectly presents the premium upsell screen to users who are active subscribers, but only for a small percentage of users. The bug is not reproducible in the test environment because all test accounts have the key present. Production log samples show the payload includes a valid `subscription` object for the affected users.

The backend team confirmed the response is valid JSON. The bug is in the `Decodable` implementation's handling of the distinction between a missing key and an explicit `null`.

## Buggy code

```swift
import Foundation

struct Subscription: Decodable {
    let tier: String
    let expiresAt: Date
}

struct UserProfile: Decodable {
    let userID: String
    let name: String
    let subscription: Subscription?

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case name
        case subscription
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        userID = try container.decode(String.self, forKey: .userID)
        name = try container.decode(String.self, forKey: .name)
        // decodeIfPresent returns nil for BOTH missing key AND explicit null
        subscription = try container.decodeIfPresent(Subscription.self,
                                                     forKey: .subscription)
    }
}
```
