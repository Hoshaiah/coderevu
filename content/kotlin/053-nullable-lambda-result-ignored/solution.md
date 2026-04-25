## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Nullable Lambda Return Silently Ignored
// ------------------------------------------------------------------------

data class RawProduct(val id: String, val name: String, val priceRaw: String?)
data class Product(val id: String, val name: String, val displayPrice: String)

fun mapProducts(rawItems: List<RawProduct>): List<Product> {
    return rawItems
        // CHANGE 1: Replace filter+map with mapNotNull so priceRaw is smart-cast to non-null String inside the block, guaranteeing only items with a real price are mapped.
        .mapNotNull { raw ->
            val price = raw.priceRaw ?: return@mapNotNull null
            Product(
                id = raw.id,
                name = raw.name,
                displayPrice = formatPrice(price)
            )
        }
}

// CHANGE 2: Accept non-null String instead of String? so passing a null price is a compile error, removing the silent "N/A" fallback that was hiding null items in the output.
fun formatPrice(price: String): String {
    return "$$price"
}
```

## Explanation

### Issue 1: `filter` Does Not Smart-Cast in Downstream `map`

**Problem:** The product list returned by `mapProducts` contains `Product` objects whose `displayPrice` is `"N/A"` instead of a real price string. The UI layer expects every item in the list to have a formatted price, so it crashes or displays garbage when it encounters `"N/A"`.

**Fix:** Replace the `.filter { it.priceRaw != null }.map { ... }` chain with a single `.mapNotNull` call. Inside the lambda, `val price = raw.priceRaw ?: return@mapNotNull null` extracts a non-null `String` or skips the item entirely, and `formatPrice` is then called with that non-null `price` value.

**Explanation:** Kotlin's smart-cast only applies within the same scope where the null-check was performed. A `.filter` lambda is a separate scope from the `.map` lambda that follows it, so inside `.map`, `raw.priceRaw` is still typed as `String?` even though the filter should have excluded nulls. Because `formatPrice` accepts `String?`, the compiler raises no warning and the call compiles fine. At runtime the filter works correctly, but `formatPrice` still receives a `String?` and the `?: "N/A"` branch is never triggered for filtered items — the real problem is that the type system gave no guarantee and the fallback string silently appeared in the output. Using `mapNotNull` keeps the null-check and the transformation in one scope, so the extracted `price` variable is typed as `String` and the compiler enforces it.

---

### Issue 2: `formatPrice` Silently Accepts `null` and Returns `"N/A"`

**Problem:** Even if a null-price item slips through any filtering logic, `formatPrice(price: String?)` produces `"N/A"` without throwing or logging anything. The caller gets back a non-null `String`, so neither the compiler nor any runtime check signals that something went wrong, and the broken item ends up in the final list.

**Fix:** Change the `formatPrice` signature from `fun formatPrice(price: String?)` to `fun formatPrice(price: String)` and remove the `?: "N/A"` fallback, leaving only `return "$$price"`. Now passing a nullable value is a compile-time error.

**Explanation:** A function that accepts a nullable parameter and returns a sensible-looking default turns a logic error into invisible data corruption. When `priceRaw` is `null` and reaches `formatPrice`, the function returns `"N/A"`, which is a valid `String` — nothing downstream can distinguish it from a legitimate price. By tightening the parameter type to `String`, any call site that passes a `String?` without a prior null-check fails to compile. This surfaces the real problem at the earliest possible point rather than hiding it behind a fallback value. A related pitfall is using the same pattern for other formatting helpers — any utility that takes a nullable and silently substitutes a default carries the same risk of masking upstream data problems.
