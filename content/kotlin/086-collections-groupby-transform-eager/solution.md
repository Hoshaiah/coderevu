## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — groupBy Transform Evaluates Eagerly Per Element
// ------------------------------------------------------------------------

data class Product(val id: String, val title: String, val tags: List<String>)

class ProductCatalogIndexer {
    fun buildIndex(products: List<Product>): Map<String, List<Product>> {
        // CHANGE 1: asSequence() makes flatMap lazy so no intermediate List of (token,product) pairs is allocated before groupBy starts
        return products.asSequence()
            // CHANGE 2: flatMap on a Sequence produces elements one at a time instead of building a full intermediate list in memory
            .flatMap { product ->
                extractTokens(product).asSequence().map { token -> token to product }
            }
            .groupBy({ it.first }, { it.second })
    }

    private fun extractTokens(product: Product): List<String> {
        return (product.title.split(" ") + product.tags)
            .map { it.lowercase().trim() }
            .filter { it.length > 2 }
    }
}
```

## Explanation

### Issue 1: Eager `flatMap` Allocates Massive Intermediate List

**Problem:** For a catalog of 500k products, each with dozens of tokens, `flatMap` builds a single `List<Pair<String, Product>>` containing potentially tens of millions of entries before `groupBy` is called even once. This is the allocation spike Ops sees — 8 GB of intermediate pairs — and causes the OOM.

**Fix:** Call `asSequence()` on `products` before `flatMap`, and call `asSequence()` on the result of `extractTokens(product)` inside the lambda. This converts both the outer and inner iterations to `Sequence` so elements are produced one at a time.

**Explanation:** Kotlin's `List.flatMap` is eager: it iterates every element, calls the transform, collects all results into a new `ArrayList`, and only returns when every element is processed. With 500k products × ~20 tokens each, that's 10 million `Pair` objects allocated at once before `groupBy` sees a single entry. `Sequence.flatMap` instead yields one pair at a time to the downstream operator, so `groupBy` can immediately insert each pair into the result map and the pair can be GC'd. The peak live memory drops from O(total_tokens) to O(result_map_size), which is far smaller. A related pitfall: forgetting to convert the inner `extractTokens` result to a `Sequence` would still cause an intermediate list per product inside the lambda, though this is much smaller than the outer list.

---

### Issue 2: Inner Token List Not Streamed Through Pipeline

**Problem:** Even after adding `asSequence()` to the outer chain, the `extractTokens(product).map { ... }` call inside the `flatMap` lambda still builds an eager `List` for every product before any pair is emitted. For a product with 30 tokens, this creates a 30-element list, materializes it, then immediately discards it once the pairs are emitted.

**Fix:** Add `.asSequence()` after `extractTokens(product)` inside the `flatMap` lambda, before the `.map { token -> token to product }` call, so the inner mapping is also lazy.

**Explanation:** `Sequence.flatMap` expects its lambda to return an `Iterable` or `Sequence`. If you return a plain `List` (an `Iterable`), Kotlin wraps it and iterates it, which works correctly but allocates the full token list per product before any pair is forwarded downstream. Wrapping with `.asSequence()` means the `.map` inside the lambda is itself lazy, emitting one `Pair` per iteration rather than collecting all pairs first. This keeps per-product allocations minimal and lets the GC reclaim token strings immediately. The combined effect of CHANGE 1 and CHANGE 2 is that at any moment only a handful of objects are live in the pipeline rather than millions.
