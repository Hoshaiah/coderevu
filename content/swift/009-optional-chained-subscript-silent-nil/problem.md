---
slug: optional-chained-subscript-silent-nil
track: swift
orderIndex: 9
title: Optional Subscript Silently Returns Nil
difficulty: easy
tags:
  - optionals
  - dictionary
  - correctness
language: swift
---

## Context

This function lives in `Analytics/EventParser.swift` and is responsible for extracting a user's preferred locale from a raw JSON payload decoded as `[String: Any]`. It feeds a downstream formatter that renders currency and date strings in the user's locale. The function is called on every analytics event before display.

Testers started noticing that locale-dependent formatting always falls back to `en_US`, even for users who explicitly set a different locale. The logs show that `preferredLocale` is always `nil` at the call site, even when the raw payload printed to the console clearly contains the `"locale"` key nested under `"preferences"`.

The developer confirmed the JSON decoding step is correct and the `payload` dictionary is fully populated before `extractLocale` is called. Adding a breakpoint inside the function shows `payload["preferences"]` is non-nil.

## Buggy code

```swift
func extractLocale(from payload: [String: Any]) -> String? {
    let prefs = payload["preferences"] as? [String: Any]
    let locale = prefs?["locale"] as? String
    return locale ?? nil
}
```
