---
slug: optional-nil-coalesce-wrong-level
track: swift
orderIndex: 7
title: Nil-Coalescing Applied Too Late
difficulty: easy
tags:
  - optionals
  - nil-coalescing
  - correctness
language: swift
---

## Context

This function lives in `ProfileViewModel.swift` in a social app. It formats a user's display name from an optional first name and optional last name fetched from a remote profile endpoint. The helper is called whenever the profile view renders and is also used in push notification payloads.

QA noticed that users with no last name sometimes see the literal string `"Optional(\"Smith\")"` in their notification banners instead of just `"Smith"`. Users with neither name see the correct fallback `"Anonymous"`, and users with both names see the correct full name.

The developer already checked the network layer — the JSON decoder is producing the right optionals. The bug is entirely in this formatting helper.

## Buggy code

```swift
func displayName(firstName: String?, lastName: String?) -> String {
    let first = firstName ?? ""
    let last = String(describing: lastName)
    if first.isEmpty && last.isEmpty {
        return "Anonymous"
    } else if first.isEmpty {
        return last
    } else if last.isEmpty {
        return first
    } else {
        return "\(first) \(last)"
    }
}
```
