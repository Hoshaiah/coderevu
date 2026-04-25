## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Default Locale Breaks Number Parsing
// ------------------------------------------------------------------------

import java.util.Locale

class CurrencyFormatter {

    fun formatForDisplay(amount: Double): String {
        // CHANGE 2: Pass Locale.getDefault() explicitly so locale-sensitive display formatting is intentional and obvious.
        return String.format(Locale.getDefault(), "%.2f", amount)
    }

    fun formatForApi(amount: Double): String {
        // CHANGE 1: Use Locale.US to guarantee a period decimal separator regardless of the device locale, so the server never receives "12,50".
        return String.format(Locale.US, "%.2f", amount)
    }

    fun parseFromApi(value: String): Double {
        // CHANGE 3: Use Locale.US with a java.text.NumberFormat parser so a period is always expected, matching the API contract and preventing NumberFormatException on non-English devices.
        val format = java.text.NumberFormat.getInstance(Locale.US)
        return format.parse(value)?.toDouble() ?: throw NumberFormatException("Cannot parse API value: $value")
    }
}
```

## Explanation

### Issue 1: `formatForApi` Uses Device Locale

**Problem:** On a German or French device, `String.format("%.2f", 12.5)` produces `"12,50"` because those locales use a comma as the decimal separator. The REST API expects `"12.50"` and returns HTTP 400 for any request containing a comma-formatted number.

**Fix:** Replace `String.format("%.2f", amount)` with `String.format(Locale.US, "%.2f", amount)` in `formatForApi()`. `Locale.US` guarantees a period decimal separator on every device regardless of system settings.

**Explanation:** `String.format` without a locale argument silently calls `Locale.getDefault()` at runtime. On a German device `Locale.getDefault()` returns `de_DE`, and the `%.2f` format specifier then uses that locale's decimal symbol, which is a comma. The server's JSON parser is strict and treats `12,50` as two separate tokens or an invalid number, so it rejects the request. Pinning to `Locale.US` makes the output locale-independent and always produces `12.50`. A related pitfall: `Double.toString()` and Kotlin's string interpolation for `Double` are locale-independent (they always use a period), but `String.format` is not — the two behave differently and that inconsistency is easy to miss.

---

### Issue 2: `formatForDisplay` Locale Is Implicit

**Problem:** `formatForDisplay` also omits a locale argument, so its behavior is tied to whatever `Locale.getDefault()` happens to be at runtime. This is actually the desired behavior for user-facing display, but the intent is invisible in the code, making it easy for a future reader to cargo-cult the pattern into `formatForApi` or to accidentally break it during a refactor.

**Fix:** Add `Locale.getDefault()` as the first argument to `String.format` in `formatForDisplay()`, changing it to `String.format(Locale.getDefault(), "%.2f", amount)`.

**Explanation:** When the locale argument is absent, `String.format` fetches the default locale internally anyway. Making it explicit documents the intent: display formatting should adapt to the user's locale. It also removes the visual symmetry between `formatForDisplay` and `formatForApi` that previously made the two look identical, helping reviewers quickly see that the two methods are intentionally different. This is a maintainability fix rather than a correctness fix, but it prevents the locale omission from being copied into API-bound code again.

---

### Issue 3: `parseFromApi` Breaks on Non-English Devices

**Problem:** `value.toDouble()` delegates to `java.lang.Double.parseDouble`, which uses the JVM's default locale on some paths. More precisely, Kotlin's `String.toDouble()` actually uses `java.lang.Double.parseDouble` which is locale-independent for the parsing itself, but if the API ever returns a value formatted with a comma (or if a developer mistakenly passes a locally-formatted string), the parse silently fails or throws. More critically, if `parseFromApi` is ever handed output from the old buggy `formatForApi` on a German device, it will throw `NumberFormatException` because `"12,50".toDouble()` fails.

**Fix:** Replace `value.toDouble()` with a `java.text.NumberFormat.getInstance(Locale.US)` parser that explicitly expects a period decimal separator, then convert the resulting `Number` to `Double`.

**Explanation:** `java.text.NumberFormat.getInstance(Locale.US)` builds a parser that only accepts the US number format (period as decimal separator), matching the API contract. This makes the parsing symmetric with `formatForApi`: both now use `Locale.US` so they round-trip correctly. If a malformed value arrives, the `parse` call returns `null` rather than silently producing a wrong number, and the Elvis operator converts that to an explicit `NumberFormatException` with a useful message. A concrete pitfall to remember: `String.toDouble()` in Kotlin does not respect the default locale for decimal separators, but `java.text.NumberFormat` and `String.format` do — mixing the two without explicit locales creates subtle asymmetry that is hard to unit-test without spinning up a non-English emulator.
