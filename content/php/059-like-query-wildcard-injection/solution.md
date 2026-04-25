## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — LIKE Wildcard Injection in Search
// ------------------------------------------------------------------------

<?php
// search.php

header('Content-Type: application/json');

$conn = new PDO('mysql:host=localhost;dbname=shop', 'app', 'secret');
$conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$query = trim($_GET['q'] ?? '');

if (strlen($query) < 2) {
    echo json_encode([]);
    exit;
}

// CHANGE 2: Reject queries longer than 100 chars before doing any DB work to prevent amplified scan cost from huge patterns.
if (strlen($query) > 100) {
    echo json_encode([]);
    exit;
}

// CHANGE 1: Escape LIKE special characters % _ and \ in user input so they match literally instead of acting as wildcards.
$safeQuery = str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $query);

$stmt = $conn->prepare(
    'SELECT id, name, price FROM products WHERE name LIKE ? LIMIT 20'
);
$stmt->execute(['%' . $safeQuery . '%']);

$results = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo json_encode($results);
```

## Explanation

### Issue 1: LIKE Wildcard Characters Not Escaped

**Problem:** A user who submits a search term containing `%` or `_` causes those characters to act as LIKE pattern wildcards in the SQL query. A term like `%_%_%` becomes the pattern `%%_%_%_%` after wrapping, which matches every row and forces MySQL to scan all 4 million rows. The prepared statement prevents SQL injection but does nothing about wildcard semantics inside the pattern value.

**Fix:** Before interpolating `$query` into the LIKE pattern, `str_replace` escapes `\`, `%`, and `_` to their backslash-prefixed literals (`\\`, `\%`, `\_`), storing the result in `$safeQuery`. The escaped value is then wrapped with `%` and passed to `execute`.

**Explanation:** PDO's prepared statements bind user input as a literal string value, so the database never parses it as SQL syntax — that is what prevents SQL injection. But LIKE pattern matching is evaluated after binding, inside MySQL's string-comparison logic. Any `%` or `_` in the bound value is still interpreted as a wildcard at that stage. Escaping these characters with a backslash tells MySQL to treat them as literal characters instead. The backslash itself must also be escaped first, otherwise a user-supplied `\` would incorrectly escape the next character in the pattern. A related pitfall: if the MySQL collation or the `ESCAPE` clause is changed, the escape character may differ — the default backslash escape works for standard MySQL LIKE without an explicit `ESCAPE` clause.

---

### Issue 2: No Upper Bound on Query Length

**Problem:** The code rejects queries shorter than 2 characters but places no ceiling on length. A search term of several hundred or thousand characters, even without wildcards, produces an extremely long LIKE pattern. MySQL's LIKE matching cost grows with pattern length, and combined with the wildcard issue, a long string of `%` characters can push query time well past 30 seconds.

**Fix:** A second length check after the minimum-length guard returns an empty JSON array and exits when `strlen($query)` exceeds 100 characters.

**Explanation:** The minimum-length guard exists to avoid accidentally expensive queries like `LIKE '%a%'` on a short term with many matches, but nothing stops a client from sending a 10,000-character string. When such a string also contains wildcards, MySQL's LIKE engine has to evaluate backtracking across the full pattern for every row. Capping input at a reasonable length — 100 characters covers all realistic product-name searches — cuts off this amplification vector before any database work happens. This cap also reduces memory overhead when constructing and transmitting the query, and it is a cheap O(1) check that adds no latency on the happy path.
