## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Raw Pagination Values in SQL Query
// ------------------------------------------------------------------------

<?php
// controllers/ProductController.php

function getProducts(PDO $db, array $query): array
{
    $page = max(1, (int) ($query['page'] ?? 1));
    // CHANGE 1: Cast $perPage to int immediately so no raw user input ever reaches the SQL string; the old code kept it as a raw string and interpolated it directly.
    $perPage = max(1, (int) ($query['per_page'] ?? 20));
    // CHANGE 2: $offset is now derived from two guaranteed integers, so the multiplication is safe; previously $offset could carry tainted data from the uncast $perPage string.
    $offset  = ($page - 1) * $perPage;

    $categoryId = $query['category_id'] ?? null;

    $sql = 'SELECT id, name, price, stock FROM products WHERE active = 1';
    $params = [];

    if ($categoryId !== null) {
        $sql .= ' AND category_id = ?';
        $params[] = (int) $categoryId;
    }

    // CHANGE 1: $perPage and $offset are now plain PHP integers, so interpolating them here is equivalent to writing a numeric literal — no injection path exists.
    $sql .= " ORDER BY name ASC LIMIT $perPage OFFSET $offset";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}
```

## Explanation

### Issue 1: Raw `per_page` Interpolated Into SQL

**Problem:** The `$perPage` variable is taken directly from `$query['per_page']` and pasted into the SQL string with `"LIMIT $perPage"`. An attacker who sends `?per_page=20 UNION SELECT username,password,3,4,5 FROM admins--` has their payload embedded verbatim into the query that PDO then prepares and executes, returning rows from the `admins` table.

**Fix:** Add `(int)` and `max(1, ...)` around the `$query['per_page']` read, exactly as `$page` was already handled. The assignment becomes `$perPage = max(1, (int) ($query['per_page'] ?? 20));`. After this, `$perPage` is always a positive PHP integer, so interpolating it into the SQL string is identical to writing a numeric literal.

**Explanation:** PHP's `(int)` cast stops at the first non-numeric character, so `(int) '20 UNION SELECT ...'` produces `20` and discards the rest. Because `PDO::ATTR_EMULATE_PREPARES` is `true`, PDO never sends the LIMIT/OFFSET tokens to MySQL as bind parameters — it does its own string substitution before the query reaches the wire, meaning even a true parameterised approach for those values would still rely on string interpolation internally. The safest and most portable fix is therefore to guarantee a PHP integer before touching the SQL string at all. A related pitfall: `max(1, ...)` prevents a zero or negative LIMIT which could cause a MySQL syntax error or an unintended full-table scan.

---

### Issue 2: `$offset` Computed From Uncast `$perPage`

**Problem:** The original code computes `$offset = ($page - 1) * (int) $perPage`. Because `$perPage` was a raw string at that point, the `(int)` cast was applied inline during the multiplication rather than to the stored variable. This is subtle but means the stored `$perPage` used in the SQL string was still the raw user string even though `$offset` happened to be a safe integer.

**Fix:** Because Issue 1 casts `$perPage` at assignment time, the `$offset` line becomes `$offset = ($page - 1) * $perPage;` with no extra cast needed — both operands are already integers, so the product is an integer and safe to interpolate.

**Explanation:** PHP's arithmetic operators do coerce strings to numbers, so `($page - 1) * (int) $perPage` would produce a valid integer for `$offset` even before the fix. The real danger was always in the `LIMIT $perPage` interpolation, not `OFFSET $offset`. However, having the cast in only one place (the multiplication) while leaving the stored variable uncast created a false sense of safety: a reader scanning the SQL line sees `$perPage` and must trace back to confirm it is safe, which the original engineer apparently did not do correctly. Casting at assignment makes the type guarantee visible at the declaration site and removes any ambiguity for every subsequent use of the variable.
