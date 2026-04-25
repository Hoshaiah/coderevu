## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — String.format Locale-Dependent Decimal Separator
// ------------------------------------------------------------------------

import java.util.Locale;

public class AmountFormatter {

    // CHANGE 1: pass Locale.US explicitly so the decimal separator is always a period regardless of the JVM default locale
    public String formatAmount(double amount) {
        return String.format(Locale.US, "%.2f", amount);
    }

    // CHANGE 2: pass Locale.US explicitly here as well so any locale-sensitive format specifiers in this pattern also use US conventions
    public String buildCsvRow(String reference, double amount, String currency) {
        return String.format(Locale.US, "%s,%s,%s", reference, formatAmount(amount), currency);
    }
}
```

## Explanation

### Issue 1: Locale-dependent decimal separator in formatAmount

**Problem:** On production servers running with the `de_DE` JVM locale, `String.format("%.2f", amount)` formats `12.5` as `"12,50"` because German locale uses a comma as the decimal separator. The payment processor expects a period and logs `"invalid amount format: 12,50"`, silently dropping the payment.

**Fix:** Replace `String.format("%.2f", amount)` with `String.format(Locale.US, "%.2f", amount)`. The `Locale.US` argument is added as the first parameter to the `String.format` call in `formatAmount`.

**Explanation:** `String.format` without a `Locale` argument calls `Locale.getDefault()` internally, which reflects whatever locale the JVM was started with. On a German server that default is `de_DE`, and the `%f` format specifier then applies German number formatting rules, swapping the period for a comma. Passing `Locale.US` pins the formatting to US conventions regardless of the server's locale setting. Note that `String.valueOf(double)` sidesteps locale issues but can produce scientific notation (e.g., `1.0E-4`) for very small values, which would also be rejected by the processor — so explicit locale-aware `String.format` is the right tool here.

---

### Issue 2: buildCsvRow also calls String.format without a locale

**Problem:** `buildCsvRow` calls `String.format("%s,%s,%s", ...)` without a locale. While `%s` is not numeric and does not currently produce a locale-dependent result, omitting the locale leaves the method inconsistent and fragile: any future change that introduces a numeric format specifier (e.g., `%d`, `%f`) into this pattern would silently reintroduce the locale bug.

**Fix:** Replace `String.format("%s,%s,%s", reference, formatAmount(amount), currency)` with `String.format(Locale.US, "%s,%s,%s", reference, formatAmount(amount), currency)` in `buildCsvRow`.

**Explanation:** Even though `%s` converts its argument via `toString()` and is not itself locale-sensitive, the habit of always supplying an explicit locale to every `String.format` call that produces externally consumed output eliminates an entire category of latent bugs. If a reviewer later adds a `%,.2f` directly in this format string — perhaps to avoid the extra method call — the locale guard is already in place. Consistency here also makes code-review easier: every `String.format` in this file that targets external output has `Locale.US` as its first argument, so a missing locale becomes immediately visible.
