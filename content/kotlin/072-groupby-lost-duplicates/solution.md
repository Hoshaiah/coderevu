## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — associateBy Drops Duplicate Keys
// ------------------------------------------------------------------------

data class StockRecord(
    val sku: String,
    val warehouseId: String,
    val quantity: Int
)

// CHANGE 1: Return Map<String, List<StockRecord>> and use groupBy instead of associateBy so all records for a SKU are retained, not just the last one.
fun buildStockIndex(records: List<StockRecord>): Map<String, List<StockRecord>> {
    return records.groupBy { it.sku }
}

// CHANGE 2: Accept Map<String, List<StockRecord>> and sum all quantities across the list, so stock from every warehouse contributes to the total.
fun totalStock(sku: String, index: Map<String, List<StockRecord>>): Int {
    return index[sku]?.sumOf { it.quantity } ?: 0
}
```

## Explanation

### Issue 1: `associateBy` Silently Drops Duplicate Keys

**Problem:** When two `StockRecord` entries share the same `sku`, `associateBy` writes the first entry into the map and then overwrites it with the second (and any subsequent) entry. The caller never sees an error; the map just holds fewer records than the input list. Inventory reports show lower stock totals for any SKU stocked in more than one warehouse because all but the last warehouse record disappear.

**Fix:** Replace `associateBy { it.sku }` with `groupBy { it.sku }` and change the return type from `Map<String, StockRecord>` to `Map<String, List<StockRecord>>`. Every record for a given SKU is now stored in a list under that key.

**Explanation:** `associateBy` is a one-to-one mapping: it builds a `Map<K, V>` where each key holds exactly one value. When the same key appears a second time, the stdlib implementation just calls `put`, which replaces whatever was there. `groupBy` is a one-to-many mapping: it appends each element to the list stored at its key, so nothing is lost. The distinction matters any time your data has a legitimate reason to repeat a key — which is exactly what warehouses per SKU represent. A related pitfall: if you later need to look up a single "canonical" record per SKU (e.g., the warehouse with the highest quantity), you can still use `groupBy` and then apply `maxByOrNull` on each list, rather than reaching for `associateBy`.

---

### Issue 2: `totalStock` Returns a Single Record's Quantity

**Problem:** With the original signature, `index[sku]` returns one `StockRecord`, so `totalStock` can only report the quantity of whichever warehouse survived the `associateBy` overwrite. Even after fixing Issue 1, if the return type were kept as a single record the function would still only report one warehouse's stock instead of the combined total.

**Fix:** Update `totalStock` to accept `Map<String, List<StockRecord>>` and compute the result with `index[sku]?.sumOf { it.quantity } ?: 0`, replacing the single `?.quantity` property access.

**Explanation:** Once the index holds a `List<StockRecord>` per key, the aggregation logic must iterate over that list. `sumOf` walks every element and accumulates `quantity`, so a SKU stocked in three warehouses with quantities 10, 20, and 30 correctly returns 60. The `?: 0` default still handles unknown SKUs. If you used `?.first()?.quantity` instead of `sumOf` you would silently regress to the same one-warehouse behaviour — only the mechanism would differ.
