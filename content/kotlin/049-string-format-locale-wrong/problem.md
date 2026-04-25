---
slug: string-format-locale-wrong
track: kotlin
orderIndex: 49
title: Default Locale Breaks Number Parsing
difficulty: easy
tags:
  - nullability
  - correctness
  - android
language: kotlin
---

## Context

This is `CurrencyFormatter.kt` in an Android finance app that formats monetary amounts for display and also serializes them to a REST API payload. The same formatter is used both for showing values to the user and for constructing API request bodies.

The app works correctly for users in the US and UK, but support tickets flood in from users in Germany, France, and other locales that use a comma as the decimal separator. The API rejects their requests with a 400 error because the server expects a period as the decimal separator, and `"12,50"` is not a valid JSON number.

The team checked the API client code and confirmed it sends whatever `formatForApi()` returns directly in the JSON body. They cannot change the server.

## Buggy code

```kotlin
import java.util.Locale

class CurrencyFormatter {

    fun formatForDisplay(amount: Double): String {
        return String.format("%.2f", amount)
    }

    fun formatForApi(amount: Double): String {
        return String.format("%.2f", amount)
    }

    fun parseFromApi(value: String): Double {
        return value.toDouble()
    }
}
```
