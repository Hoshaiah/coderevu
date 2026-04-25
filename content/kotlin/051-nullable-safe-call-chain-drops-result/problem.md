---
slug: nullable-safe-call-chain-drops-result
track: kotlin
orderIndex: 51
title: Safe Call Silently Returns Null
difficulty: easy
tags:
  - nullability
  - kotlin-idioms
  - correctness
language: kotlin
---

## Context

This utility function lives in `util/StringExtensions.kt` and is used throughout a payment processing service to normalise merchant-supplied category codes before they are stored in the database. The surrounding code assumes a non-null trimmed string is always returned when a non-null input is given.

In production, category codes are being stored as `null` in the database even when the merchant sends a non-empty string. The downstream report queries that filter by category return incomplete results, and the merchant support team is flooded with tickets. The bug only appears for category strings that contain leading or trailing whitespace, which is common in CSV uploads.

Logging confirms the raw input is never null or empty — the issue is in the transformation step. A junior developer added the safe-call operator `?.` defensively, thinking it was harmless.

## Buggy code

```kotlin
fun normaliseCategoryCode(raw: String?): String? {
    return raw
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
        ?.uppercase()
}

fun storeCategoryCode(raw: String?) {
    val code = normaliseCategoryCode(raw)
    // Caller assumes code is non-null when raw is non-null and non-blank
    println("Storing code: $code")
    // db.insert(code) — downstream treats null as missing category
}
```
