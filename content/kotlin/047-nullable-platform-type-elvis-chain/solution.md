## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Platform Type Nullability Crash at Runtime
// ------------------------------------------------------------------------

import android.content.SharedPreferences

class PreferenceHelper(private val prefs: SharedPreferences) {

    fun getDisplayName(): String {
        // CHANGE 1: Declare name as nullable String? so the platform type is widened to nullable, letting the Elvis operator actually fire instead of crashing on the implicit non-null assertion.
        // CHANGE 2: Pass "Guest" as the defValue so the SDK itself never returns null, removing the need for the Elvis operator entirely and making intent explicit at the call site.
        val name: String? = prefs.getString("display_name", "Guest")
        return name ?: "Guest"
    }
}
```

## Explanation

### Issue 1: Platform Type Bypasses Elvis Operator

**Problem:** On devices where `display_name` has never been saved, `prefs.getString` returns `null`. The app either crashes with a `NullPointerException` before the greeting label is set, or the label displays the literal string `"null"` downstream when `.uppercase()` is called.

**Fix:** Change the declared type of `name` from `String` to `String?` (see `CHANGE 1`). This makes Kotlin treat the platform type as nullable rather than non-nullable, so the Elvis operator `?: "Guest"` actually evaluates when the value is null.

**Explanation:** Kotlin's platform type `String!` means the compiler lets you choose how to treat it. When you assign it to a `String` (non-nullable), Kotlin inserts an implicit `checkNotNull` assertion at that assignment line. If the value is `null`, that assertion throws `NullPointerException` immediately — before execution even reaches the `?:` operator on the same line. The Elvis operator therefore never runs. Declaring the variable as `String?` removes the implicit assertion and routes null values through the Elvis operator as intended. A related pitfall: if you pass the result directly to a non-null parameter without any intermediate variable, the same hidden assertion fires there instead.

---

### Issue 2: Null defValue Masks Intent and Enables Null Return

**Problem:** Passing `null` as the second argument to `prefs.getString` tells the SDK to return `null` when the key is missing, which is the root cause of the null arriving in Kotlin in the first place. The developer's intent — to use `"Guest"` as the fallback — is split across two layers, making the code harder to read and the SDK's null-returning path unnecessarily active.

**Fix:** Replace `null` with `"Guest"` as the `defValue` argument in the `getString` call (see `CHANGE 2`). The SDK now returns `"Guest"` directly when the key is absent, so the Elvis operator acts as a secondary safety net for any remaining edge case.

**Explanation:** `SharedPreferences.getString(key, defValue)` returns `defValue` when the key does not exist. Passing `null` there means the SDK actively returns `null` on a missing key, which is the value that then flows into Kotlin and causes the crash or `"null"` display. Supplying `"Guest"` as the `defValue` closes off the null-returning path at the SDK level, which is the most direct fix. Keeping the Elvis operator as well (`?: "Guest"`) means the code is still safe if someone later changes the `defValue` back or wraps this call differently. One edge case to be aware of: if the preference exists in storage but was explicitly saved as `null` through a raw `putString(key, null)` call, the SDK can still return `null` even with a non-null `defValue`, so the nullable declaration from Issue 1 remains necessary.
