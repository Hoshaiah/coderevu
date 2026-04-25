---
slug: decodable-array-partial-failure-crash
track: swift
orderIndex: 18
title: Decodable Array Fails on Single Bad Element
difficulty: medium
tags:
  - optionals
  - decodable
  - error-handling
  - json
language: swift
---

## Context

`API/FeedDecoder.swift` decodes a JSON array of `FeedItem` objects returned by the server. The API contract says all fields are required, but the backend team confirmed that a bad data migration occasionally writes records with a `null` `authorId` field. The app is expected to skip malformed items gracefully rather than failing the entire feed load.

Customers reported that the feed goes completely blank after the bad migration even though only a handful of the 200+ items in the response are malformed. Crash logs show `Swift.DecodingError.valueNotFound` originating from `FeedDecoder.decode`. No items are displayed.

The developer added a `do/catch` around the outer `JSONDecoder().decode([FeedItem].self, from: data)` call, but the whole array still fails at once because the error is thrown before the catch has any partial results.

## Buggy code

```swift
struct FeedItem: Decodable {
    let id: String
    let title: String
    let authorId: String
}

struct FeedDecoder {
    func decode(from data: Data) throws -> [FeedItem] {
        return try JSONDecoder().decode([FeedItem].self, from: data)
    }
}
```
