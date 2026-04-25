## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Correlated Subquery Causes Table Scan
// ------------------------------------------------------------------------

<?php
// reports/SalesReport.php

function getSalesRepSummary(PDO $pdo): array
{
    // CHANGE 1+2: Replace both correlated subqueries with a single LEFT JOIN to a grouped inline view so MySQL aggregates all orders in one pass instead of once per rep.
    $sql = "
        SELECT
            sr.id,
            sr.name,
            COALESCE(agg.order_count, 0) AS order_count,
            -- CHANGE 3: Wrap in COALESCE so reps with no recent orders get 0 instead of NULL, making ORDER BY deterministic.
            COALESCE(agg.total_sales, 0) AS total_sales
        FROM sales_reps sr
        LEFT JOIN (
            SELECT
                o.rep_id,
                COUNT(*) AS order_count,
                SUM(o.total_amount) AS total_sales
            FROM orders o
            WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY o.rep_id
        ) AS agg ON agg.rep_id = sr.id
        ORDER BY total_sales DESC
    ";

    $stmt = $pdo->query($sql);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}
```

## Explanation

### Issue 1: Correlated Subqueries Cause Per-Rep Table Scans

**Problem:** The query contains two correlated subqueries that reference `sr.id` from the outer row. MySQL re-executes each subquery once for every row in `sales_reps`, so with 800 reps the database runs 1,600 separate range scans against `orders`. The cron job that once finished in 3 seconds now times out at 300 seconds because the `orders` table has grown to 4 million rows.

**Fix:** Both correlated subqueries are removed and replaced with a single derived table (inline view) that groups `orders` by `rep_id` in one pass, then joins the result to `sales_reps` with `LEFT JOIN ... ON agg.rep_id = sr.id`. The aggregation columns `agg.order_count` and `agg.total_sales` are selected directly.

**Explanation:** A correlated subquery is re-evaluated for each outer row because it contains a reference to the outer query (`sr.id`). MySQL cannot hoist it out and compute it once. Moving the aggregation into a derived table lets MySQL scan `orders` a single time, group by `rep_id`, and store the results temporarily. The subsequent join to `sales_reps` is then a cheap lookup into that small grouped result. The existing index on `orders.rep_id` and `orders.created_at` is now used efficiently by the single grouped scan rather than being hit 800 separate times. Adding an index on `total_amount` had no effect because the bottleneck was execution count, not row-level filtering cost.

---

### Issue 2: Duplicate Aggregation Work From Two Separate Subqueries

**Problem:** Even if each correlated subquery were cheap in isolation, having two of them — one for `COUNT(*)` and one for `SUM(total_amount)` — means MySQL performs twice the work for the same predicate and the same rows. Each of the 800 reps triggers two independent executions, totalling 1,600 scans instead of 800.

**Fix:** Both subqueries are collapsed into a single derived table inside the `LEFT JOIN` that computes `COUNT(*) AS order_count` and `SUM(o.total_amount) AS total_sales` together in one `GROUP BY o.rep_id` pass.

**Explanation:** MySQL processes each correlated subquery independently; it does not recognize that two subqueries with identical `WHERE` conditions could be merged. Combining both aggregates into a single `SELECT` inside the derived table means the database reads and filters the `orders` rows exactly once, then materializes a small grouped result. This halves the I/O cost compared to even a hypothetical optimized version of the original two-subquery approach. The fix also makes it straightforward to add more aggregate columns later — a `MAX(created_at)` or `AVG(total_amount)`, for example — without multiplying scan count again.

---

### Issue 3: NULL `total_sales` Breaks ORDER BY for Reps With No Orders

**Problem:** Any sales rep who has no orders in the 30-day window returns `NULL` from the `SUM` subquery. `ORDER BY total_sales DESC` places `NULL` values in an implementation-defined position — MySQL puts them last in descending order, but this is not guaranteed and differs from some reporting expectations. The `order_count` for those reps also shows `NULL` instead of `0`, which downstream PHP code or templates may not handle safely.

**Fix:** Both selected columns are wrapped with `COALESCE(agg.order_count, 0)` and `COALESCE(agg.total_sales, 0)` so reps with no matching orders produce `0` rather than `NULL`.

**Explanation:** When the `LEFT JOIN` finds no matching row in the derived table for a given `sales_rep`, all columns from `agg` are `NULL`. `SUM` of zero rows is `NULL` in SQL, not `0`. `COALESCE` returns the first non-NULL argument, so `COALESCE(NULL, 0)` yields `0`. With numeric `0` values in place, `ORDER BY total_sales DESC` sorts deterministically and PHP arithmetic on the result (totals, averages, formatting) will not produce warnings or unexpected behavior from operating on `NULL`. A related pitfall: if the derived table is later filtered with a `HAVING` clause, `NULL` values would be silently excluded, which `COALESCE` also prevents.
