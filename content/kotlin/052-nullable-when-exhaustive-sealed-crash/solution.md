## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Null Variant Crashes Sealed When
// ------------------------------------------------------------------------

sealed class NotificationState {
    data class Info(val message: String) : NotificationState()
    data class Warning(val message: String, val code: Int) : NotificationState()
    object Dismissed : NotificationState()
}

fun renderNotification(state: NotificationState?): String {
    // CHANGE 1: added explicit null branch so a null state returns empty string instead of throwing IllegalStateException
    return when (state) {
        null -> ""
        is NotificationState.Info -> "ℹ️ ${state.message}"
        is NotificationState.Warning -> "⚠️ ${state.message} (${state.code})"
        // CHANGE 2: added else branch to make the when exhaustive against future subclasses and prevent silent runtime crashes
        NotificationState.Dismissed -> ""
        else -> ""
    }
}
```

## Explanation

### Issue 1: Missing null branch crashes `when`

**Problem:** When `state` is `null`, the `when` expression has no matching branch and Kotlin throws `IllegalStateException: state is null`. Users who open the notification panel immediately after a dismissal — when the `LiveData` emits `null` to clear the current notification — hit this crash.

**Fix:** A `null ->` branch is added as the first arm of the `when` expression, returning an empty string. This is at the `// CHANGE 1` site.

**Explanation:** Kotlin's `when` on a sealed class is only exhaustive for the non-null subclasses. When the subject type is `NotificationState?`, the compiler treats `null` as a separate case that none of the `is NotificationState.X` branches match. Without an explicit `null ->` arm (or a top-level `else`), the runtime finds no matching branch and throws. Placing `null ->` first is idiomatic and also gives the smart-cast machinery a clean path: after the null check, all subsequent branches operate on a non-null `NotificationState`.

---

### Issue 2: No `else` branch leaves future subclasses unhandled at runtime

**Problem:** Because `NotificationState` is sealed, adding a new subclass later (e.g., `Error`) will not cause a compile-time error here — the `when` on a nullable type is not treated as exhaustive by the compiler. A new subclass silently falls through and throws at runtime.

**Fix:** An `else -> ""` branch is added as the final arm of the `when` expression at the `// CHANGE 2` site, giving a safe default for any subclass not explicitly listed.

**Explanation:** A `when` on a sealed type is exhaustive (no `else` needed) only when the subject is the non-nullable sealed type itself. Because the parameter here is `NotificationState?`, the compiler no longer guarantees exhaustiveness, so it does not force you to cover every subclass. Adding `else -> ""` means any unrecognised variant degrades gracefully to an empty string rather than crashing. If you prefer a compile-time guarantee, you can make the function accept `NotificationState` (non-nullable) and handle `null` at the call site before invoking `renderNotification`, which restores sealed-class exhaustiveness checking.
