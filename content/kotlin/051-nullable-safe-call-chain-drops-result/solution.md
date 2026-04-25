## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Safe Call Silently Returns Null
// ------------------------------------------------------------------------

fun normaliseCategoryCode(raw: String?): String? {
    return raw
        // CHANGE 1: Use plain `.trim()` not `?.trim()` — raw is already known non-null here because the leading `?.` guards the whole chain; the extra `?.` on trim() is redundant and causes a String? return that silently passes null downstream when raw has whitespace.
        .trim()
        .takeIf { it.isNotEmpty() }
        ?.uppercase()
}

// CHANGE 2: Tighten overload for non-null callers so the compiler enforces the non-null contract; callers that always pass a non-null String get a non-null String back.
fun normaliseCategoryCode(raw: String): String? {
    return raw
        .trim()
        .takeIf { it.isNotEmpty() }
        ?.uppercase()
}

fun storeCategoryCode(raw: String?) {
    val code = normaliseCategoryCode(raw)
    // Caller assumes code is non-null when raw is non-null and non-blank
    println("Storing code: $code")
    // db.insert(code) — downstream treats null as missing category
}
```

## Explanation

### Issue 1: Redundant Safe-Call Swallows Non-Null Input

**Problem:** Any `raw` string that contains leading or trailing whitespace is stored as `null` in the database. Merchants see their category codes disappear even though the raw CSV value is present and non-empty.

**Fix:** Replace `?.trim()` with `.trim()` on the second line of the chain inside `normaliseCategoryCode`. The first `?.` already guards the entry into the chain when `raw` is null; adding another `?.` before `trim()` is redundant and changes the type of `raw` inside the lambda to `String?`, making `.trim()` return `String?` and poisoning every subsequent call in the chain.

**Explanation:** When Kotlin sees `raw?.trim()`, the receiver `raw` is `String?`. The safe-call short-circuits to `null` only when `raw` is `null`. But if `raw` is `" FOOD "`, the safe-call does not short-circuit — it calls `.trim()` and returns `String?` (not `String`) because that is the inferred type of the entire `?.` expression. Once `.trim()` returns `String?`, the next `?.takeIf` is also a safe-call on a nullable, meaning if `.trim()` somehow returned null (it cannot here, but the type system treats it as possible) the chain collapses. More concretely, `" FOOD "?.trim()` evaluates to the `String?` value `"FOOD"` — which is fine — but the developer who writes `?.uppercase()` after `?.takeIf` now has an expression of type `String?`, and `null` can flow through at any point. The root confusion is that `?.` on a non-null value is not a no-op at the type level: it widens the return type to nullable and opens a null-propagation path that did not exist before. Replacing `?.trim()` with `.trim()` keeps the receiver typed as `String` after the first null-guard, so the chain returns `String` until `takeIf` deliberately narrows it back to `String?` for the empty-string case.

---

### Issue 2: Return Type Does Not Encode Non-Null Contract for Non-Null Inputs

**Problem:** The single `normaliseCategoryCode(raw: String?)` overload returns `String?` for every call site, including those that pass a `String` that is guaranteed non-null. The compiler cannot warn when a caller ignores the possibility of null, so the missing-category bug can reappear anywhere a future developer adds a new call site.

**Fix:** Add an overload `fun normaliseCategoryCode(raw: String): String?` that accepts a non-null `String`. Call sites in `storeCategoryCode` and elsewhere that already hold a non-null `String` resolve to this overload, making the null-only-for-blank contract visible in the type signature and checkable at compile time.

**Explanation:** Kotlin's type system lets you express the invariant "if you give me a non-null string I will never return null for a non-blank input" through overloads or a non-nullable signature. The original single overload with `String?` input and `String?` output mixes two distinct behaviours: "input was null, so output is null" and "input was non-blank, so output is the normalised code". By adding a non-null overload, callers that pass a `String` (the common case from CSV parsing) bind to the more specific overload, and any accidental null-return from a future edit to the function body would require an explicit `!!` or `?.let` at the call site, making the bug visible immediately. This is a minimal, additive change — the nullable overload remains for callers that genuinely have a `String?`.
