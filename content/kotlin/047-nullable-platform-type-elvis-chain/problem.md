---
slug: nullable-platform-type-elvis-chain
track: kotlin
orderIndex: 47
title: Platform Type Nullability Crash at Runtime
difficulty: easy
tags:
  - nullability
  - kotlin-java-interop
  - npe
language: kotlin
---

## Context

In `util/PreferenceHelper.kt`, the app reads a user display name from `SharedPreferences`. The helper is used in a profile screen's `onResume` to populate a greeting label. The Java `SharedPreferences.getString` method is called via the Android SDK, which is not annotated with `@Nullable` or `@NonNull` in the version the project depends on — so Kotlin treats the return type as a platform type (`String!`).

On devices where the preference has never been set, the greeting label shows as `null` in the UI (literally the string `"null"`), and in some cases a `NullPointerException` crashes the app when calling `.uppercase()` on the result downstream.

The team assumed the Elvis operator `?: "Guest"` guarded against null and couldn't understand why it had no effect in practice.

## Buggy code

```kotlin
import android.content.SharedPreferences

class PreferenceHelper(private val prefs: SharedPreferences) {

    fun getDisplayName(): String {
        // getString returns String! (platform type) — Kotlin trusts us here
        val name: String = prefs.getString("display_name", null) ?: "Guest"
        return name
    }
}
```
