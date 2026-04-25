---
slug: optional-nil-coalesce-map-transform-skipped
track: swift
orderIndex: 21
title: Optional Map Skips Nil Coalesce Transform
difficulty: medium
tags:
  - optionals
  - functional
  - correctness
  - map
language: swift
---

## Context

This code is in `ProfileParser.swift`, part of a user profile parsing pipeline in a social networking app. Raw API responses may omit the `username` field, in which case a generated handle like `"user_" + userID` should be used as a fallback. The parser is called for every profile returned in a feed response.

QA finds that some profile cards display a raw `nil`-looking placeholder label instead of the generated handle. Adding logging shows that `parseUsername` returns `nil` even when `userID` is present and valid. The bug only affects profiles where the API omits `username`.

The team already verified the JSON decoding is correct and that `raw["username"]` is indeed `nil` for the affected profiles (the key is absent from the JSON). They are puzzled because the nil-coalescing fallback looks syntactically correct to them.

## Buggy code

```swift
func parseUsername(raw: [String: String], userID: String) -> String? {
    return raw["username"]
        .map { $0.trimmingCharacters(in: .whitespaces) }
        ?? "user_" + userID
}

// Caller:
let profile = parseUsername(raw: [:], userID: "42")
// Expected: "user_42"
// Actual:   nil
```
