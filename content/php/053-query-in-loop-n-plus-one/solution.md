## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — N+1 Queries in Order Listing
// ------------------------------------------------------------------------

<?php
// admin/orders/index.php

require_once __DIR__ . '/../../bootstrap.php';

$pdo  = get_db_connection();
$page = max(1, (int) ($_GET['page'] ?? 1));
$offset = ($page - 1) * 50;

// CHANGE 1: Replaced the single-table SELECT + per-row user lookup with a single JOIN query so all user data is fetched in one round-trip instead of 51.
$stmt = $pdo->prepare(
    "SELECT o.id, o.total, o.status, o.created_at, u.name, u.email
       FROM orders o
       JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC
      LIMIT 50 OFFSET ?"
);
$stmt->execute([$offset]);
$orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo "<table><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th></tr>";

foreach ($orders as $order) {
    // CHANGE 1: Removed the per-iteration prepare/execute/fetch against `users`; name and email now come directly from the JOIN result.

    echo "<tr>";
    echo "<td>" . htmlspecialchars($order['id'], ENT_QUOTES, 'UTF-8') . "</td>";
    // CHANGE 2: Build the display string with a plain '<' character and let htmlspecialchars encode it, instead of embedding the literal string '&lt;' which caused double-encoding to '&amp;lt;'.
    echo "<td>" . htmlspecialchars($order['name'] . ' <' . $order['email'] . '>', ENT_QUOTES, 'UTF-8') . "</td>";
    echo "<td>" . htmlspecialchars(number_format($order['total'] / 100, 2), ENT_QUOTES, 'UTF-8') . "</td>";
    echo "<td>" . htmlspecialchars($order['status'], ENT_QUOTES, 'UTF-8') . "</td>";
    echo "</tr>";
}

echo "</table>";
```

## Explanation

### Issue 1: N+1 Queries in Loop

**Problem:** The page fires one `SELECT` against `orders` to get 50 rows, then fires a separate `SELECT` against `users` for every row inside the `foreach` loop. That is 51 sequential database round-trips per page load. Each round-trip is fast in isolation (the slow-query log confirms this), but 51 of them in series accumulate to 8–12 seconds of wall-clock wait time.

**Fix:** The single-table `SELECT id, user_id, total, status, created_at FROM orders` is replaced with a `JOIN` query: `SELECT o.id, o.total, o.status, o.created_at, u.name, u.email FROM orders o JOIN users u ON u.id = o.user_id`. The `prepare`/`execute`/`fetch` block inside the `foreach` is deleted entirely. `$order['name']` and `$order['email']` are read directly from the joined result set.

**Explanation:** Every call to `$pdo->prepare()` and `$stmt->execute()` inside a loop sends a new network packet to the database, waits for the server to parse the query, execute it, and send back a response. Even at 2 ms per round-trip that is 100 ms for 50 rows — and real-world latency including connection overhead pushes it much higher. A single `JOIN` lets the database engine perform one index lookup per matched row internally and return all 50 rows in a single response. The related pitfall to watch for: if an order can have a deleted or missing user, an `INNER JOIN` will silently drop that order row from the results; use `LEFT JOIN` and guard against a `null` `$order['name']` if that case is possible in production data.

---

### Issue 2: Double-Encoding of HTML Entity

**Problem:** The customer cell is built by concatenating the literal string `'&lt;'` into the value passed to `htmlspecialchars`. Because `htmlspecialchars` encodes `&` as `&amp;`, the browser receives `&amp;lt;` and renders the text `John Smith &lt;john@example.com&gt;` instead of `John Smith <john@example.com>`.

**Fix:** The string concatenation is changed from `$user['name'] . ' &lt;' . $user['email'] . '&gt;'` to `$order['name'] . ' <' . $order['email'] . '>'`, using literal `<` and `>` characters. `htmlspecialchars` then encodes them to `&lt;` and `&gt;` exactly once, producing the correct HTML.

**Explanation:** `htmlspecialchars` is designed to receive raw text and produce safe HTML — it encodes `<`, `>`, `&`, `"`, and `'`. When you pre-encode `<` as `&lt;` before passing the string in, `htmlspecialchars` sees the `&` in `&lt;` and encodes it again to `&amp;`, giving `&amp;lt;`. The fix is to keep the input string as plain text (with literal angle brackets) and let `htmlspecialchars` do all the encoding in one pass. A related pitfall: the same double-encoding happens any time you mix already-escaped HTML fragments with `htmlspecialchars` — always pass raw, unescaped strings into that function.
