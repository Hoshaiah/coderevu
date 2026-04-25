---
slug: null-map-getordefault-wrong
track: kotlin
orderIndex: 45
title: Null Value Mistaken for Missing Key
difficulty: easy
tags:
  - nullability
  - collections
  - maps
language: kotlin
---

## Context

This is in `config/FeatureFlags.kt`. The app stores feature-flag overrides in a `Map<String, String?>` where a key mapping to `null` explicitly means "disabled by admin" and a missing key means "use the default". The function is supposed to return the stored value when present (even if null) and fall back to a default only when the key is truly absent.

QA reported that flags explicitly set to `null` in the override map are behaving as if they were never set — the default is returned instead of `null`. This means admin-disabled features are silently re-enabled.

## Buggy code

```kotlin
class FeatureFlags(private val overrides: Map<String, String?>) {

    fun get(key: String, default: String?): String? {
        return overrides[key] ?: default
    }
}
```
