## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Non-Deterministic GROUP BY Aggregation
// ------------------------------------------------------------------------

<?php
// reports/sales_by_rep.php

$pdo = new PDO('mysql:host=localhost;dbname=sales', 'reporting', 'secret', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

// Returns one row per sales rep: their total, most recent sale date,
// and the order_id/customer from that most recent sale.

// CHANGE 1+2+3: Replaced the flat GROUP BY query with a two-level query. The inner subquery uses ROW_NUMBER() partitioned by rep_id and ordered by sale_date DESC to tag the most-recent row, then the outer query aggregates totals and picks the tagged row — so order_id and customer_name are guaranteed to belong to the MAX(sale_date) row, and no bare non-aggregated columns appear outside a valid aggregate or the GROUP BY list, satisfying ONLY_FULL_GROUP_BY on MySQL 8.
$stmt = $pdo->query(
    'SELECT
        r.name                    AS rep_name,
        agg.rep_id,
        latest.order_id,
        latest.customer_name,
        agg.latest_sale,
        agg.total_amount
     FROM (
         SELECT
             rep_id,
             MAX(sale_date) AS latest_sale,
             SUM(amount)    AS total_amount
         FROM sales
         GROUP BY rep_id
     ) agg
     JOIN (
         SELECT
             rep_id,
             order_id,
             customer_name,
             sale_date,
             ROW_NUMBER() OVER (PARTITION BY rep_id ORDER BY sale_date DESC) AS rn
         FROM sales
     ) latest ON latest.rep_id = agg.rep_id AND latest.rn = 1
     JOIN reps r ON r.id = agg.rep_id'
);

$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
header('Content-Type: application/json');
echo json_encode($rows);
```

## Explanation

### Issue 1: ONLY_FULL_GROUP_BY error empties production output

**Problem:** The original query selects `s.order_id`, `s.customer_name`, and `r.name` without aggregating them and without including them in `GROUP BY`. MySQL 8 has `ONLY_FULL_GROUP_BY` enabled by default, so the query raises an error. The code catches no exceptions at the query level, but the calling dashboard code was catching them silently and rendering an empty table — which is why managers see no data on Mondays (after a nightly deploy to production).

**Fix:** The rewrite removes all bare non-aggregated columns from the top-level `SELECT`. Aggregation (`SUM`, `MAX`) happens in the `agg` subquery grouped strictly by `rep_id`, and `r.name` is fetched via a `JOIN` after aggregation. No column in the final `SELECT` list is outside an aggregate or a `GROUP BY` key.

**Explanation:** `ONLY_FULL_GROUP_BY` requires that every column in `SELECT`, `HAVING`, and `ORDER BY` is either inside an aggregate function or listed in `GROUP BY`. Staging had this mode disabled, masking the problem. MySQL would pick an arbitrary row's `order_id` for each group — which is undefined behavior. The fix makes the query legal under strict mode by never exposing a non-aggregated column at the outermost query level; `order_id` and `customer_name` come from a subquery that resolves a single deterministic row before the outer join runs.

---

### Issue 2: order_id and customer_name do not correspond to the MAX(sale_date) row

**Problem:** Even on staging (where the query runs without an error), MySQL may return the `order_id` and `customer_name` of any row in the group, not necessarily the one whose `sale_date` equals `MAX(sale_date)`. Managers see an order ID that does not match the latest-sale date shown in the same row, making the report untrustworthy for follow-up calls.

**Fix:** A `ROW_NUMBER() OVER (PARTITION BY rep_id ORDER BY sale_date DESC)` window function in the `latest` subquery ranks each rep's sales by recency. The outer query joins on `latest.rn = 1`, guaranteeing `order_id` and `customer_name` come from the single most-recent sale row.

**Explanation:** `MAX(sale_date)` computes correctly as an aggregate, but MySQL has no mechanism to "carry along" the other columns from the same row as the maximum — each column is resolved independently. A window function evaluates before aggregation and assigns a rank within each partition, so `rn = 1` isolates exactly the row with the highest `sale_date`. If two sales share the identical `sale_date` for the same rep, `ROW_NUMBER` still returns exactly one row (ties are broken arbitrarily by the engine); using `RANK` instead would return multiple rows and break the join, so `ROW_NUMBER` is the right choice here.

---

### Issue 3: rep_id-only GROUP BY makes r.name non-deterministic

**Problem:** The original query joins `reps` and selects `r.name` but groups only by `s.rep_id`. If the `reps` table were ever denormalized or if a future schema change caused multiple `reps` rows per `rep_id`, `r.name` would be picked arbitrarily per group. Even with a clean schema today, it still violates `ONLY_FULL_GROUP_BY` because `r.name` is not in the `GROUP BY` list.

**Fix:** `r.name` is moved outside the aggregation subquery entirely. The `agg` subquery touches only the `sales` table and groups by `rep_id`. The join to `reps r` happens in the outer query after both subqueries are resolved, so `r.name` is a straightforward 1:1 join result, not a grouped column.

**Explanation:** Joining before grouping forces the database to resolve the join first, multiplying rows, and then aggregate — at which point any selected column from the joined table that is not in `GROUP BY` is non-deterministic. Joining after aggregation avoids the problem entirely: `agg.rep_id` is already one row per rep, so `JOIN reps r ON r.id = agg.rep_id` produces exactly one `r.name` per output row with no ambiguity. This pattern (aggregate first, join dimension tables after) is also generally more efficient because aggregation works on fewer columns before the join.
