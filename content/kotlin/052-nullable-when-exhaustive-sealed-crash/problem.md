---
slug: nullable-when-exhaustive-sealed-crash
track: kotlin
orderIndex: 52
title: Null Variant Crashes Sealed When
difficulty: easy
tags:
  - nullability
  - sealed-class
  - correctness
language: kotlin
---

## Context

This rendering helper lives in `ui/NotificationRenderer.kt` and maps a sealed class `NotificationState` to a display string. The function is called from the adapter's `onBindViewHolder`. The `NotificationState` value comes from a `LiveData<NotificationState?>` where `null` is used to indicate 'no notification pending'.

In production, the app crashes with `IllegalStateException: state is null` at a rate of about 0.3% of sessions. The crash happens when a user opens the notification panel immediately after a notification is dismissed. The `null` state is emitted to clear the current notification, and the `when` expression does not handle it.

The developer assumed that the `when` expression on a sealed class was exhaustive and safe. The issue is that the function parameter accepts the nullable type `NotificationState?` but the `when` branches only cover the non-null subclasses.

## Buggy code

```kotlin
sealed class NotificationState {
    data class Info(val message: String) : NotificationState()
    data class Warning(val message: String, val code: Int) : NotificationState()
    object Dismissed : NotificationState()
}

fun renderNotification(state: NotificationState?): String {
    // BUG: when on a nullable sealed class without a null branch
    // throws IllegalStateException when state is null
    return when (state) {
        is NotificationState.Info -> "ℹ️ ${state.message}"
        is NotificationState.Warning -> "⚠️ ${state.message} (${state.code})"
        NotificationState.Dismissed -> ""
    }
}
```
